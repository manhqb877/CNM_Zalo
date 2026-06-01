import { getModel, AI_MODELS } from '../../infrastructure/gemini';
import { FriendshipModel } from '../friends/friendship.model';
import { UserModel } from '../users/user.model';
import { PostModel } from '../posts/post.model';
import { MessageModel } from '../messages/message.model';
import { ConversationModel } from '../conversations/conversation.model';
import { ConversationMemberModel } from '../conversations/conversation-member.model';
import { logger } from '../../shared/logger';
import { AppError } from '../../shared/errors';


export class AiChatService {
  /**
   * Chat with AI inside a conversation with full DB context (friends, posts, chat history)
   */
  static async chatWithAi(userId: string, conversationId: string | undefined, message: string): Promise<string> {
    logger.info('[AI Chat] Processing chat request', { userId, conversationId });

    // 1. Fetch friends count and profiles
    const friendships = await FriendshipModel.find({
      $or: [{ userId }, { friendId: userId }],
      status: 'accepted'
    }).lean();

    const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);
    
    const friends = friendIds.length > 0 
      ? await UserModel.find({ _id: { $in: friendIds } }).select('displayName username email').lean()
      : [];

    const friendsInfo = friends.map(f => `- ${f.displayName} (@${f.username || ''}) - Email: ${f.email || 'N/A'}`).join('\n');
    const friendsCount = friends.length;

    // 2. Fetch friends' recent posts
    let recentPostsInfo = 'Không có bài đăng mới nào từ bạn bè.';
    if (friendIds.length > 0) {
      const posts = await PostModel.find({
        authorId: { $in: friendIds },
        status: 'published'
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

      // Filter out posts containing mock typescript advanced types or 500ms to 10ms optimization text
      const filteredPosts = posts.filter(p => 
        !p.title.includes('TypeScript advanced types') && 
        !p.content.includes('tối ưu MongoDB')
      );

      if (filteredPosts.length > 0) {
        // Fetch author names
        const authorIds = filteredPosts.map(p => p.authorId);
        const authors = await UserModel.find({ _id: { $in: authorIds } }).select('displayName').lean();
        const authorMap = new Map(authors.map(a => [String(a._id), a.displayName]));

        recentPostsInfo = filteredPosts.map(p => {
          const authorName = authorMap.get(String(p.authorId)) || 'Người dùng Zync';
          return `- [Bài viết] "${p.title}" của tác giả ${authorName} đăng lúc ${new Date(p.createdAt).toLocaleDateString('vi-VN')}\n  Nội dung tóm tắt: ${p.content.slice(0, 150)}...`;
        }).join('\n');
      }
    }

    // 3. Fetch chat message context
    let chatHistoryContext = 'Hội thoại chưa có tin nhắn nào hoặc không cung cấp cuộc hội thoại.';
    if (conversationId) {
      const messages = await MessageModel.find({
        conversationId,
        isDeleted: { $ne: true }
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

      if (messages.length > 0) {
        // Fetch sender names
        const senderIds = Array.from(new Set(messages.map(m => m.senderId)));
        const senders = await UserModel.find({ _id: { $in: senderIds } }).select('displayName').lean();
        const senderMap = new Map(senders.map(s => [String(s._id), s.displayName]));

        // Reverse to get chronological order
        const chronologicalMessages = [...messages].reverse();
        chatHistoryContext = chronologicalMessages.map(m => {
          const senderName = senderMap.get(String(m.senderId)) || 'Người dùng Zync';
          const time = new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          return `[${time}] ${senderName}: ${m.content || '[Tệp đính kèm hoặc hình ảnh]'}`;
        }).join('\n');
      }
    }

    // 3. Fetch conversation members and details context
    let conversationContextInfo = 'Không ở trong phòng chat cụ thể nào.';
    let conversationMembersInfo = 'Không có thông tin thành viên.';
    
    if (conversationId) {
      const conversation = await ConversationModel.findById(conversationId).lean();
      if (conversation) {
        const isGroup = conversation.type === 'group';
        conversationContextInfo = `ID cuộc trò chuyện: ${conversationId}\nLoại cuộc trò chuyện: ${isGroup ? 'Nhóm (Group Chat)' : 'Cá nhân 1-1 (Direct Chat)'}\nTên cuộc trò chuyện: ${conversation.name || (isGroup ? 'Nhóm chat không tên' : 'Trò chuyện 1-1')}`;
        
        // Fetch all members of this conversation
        const members = await ConversationMemberModel.find({ conversationId }).lean();
        const memberUserIds = members.map(m => m.userId);
        
        if (memberUserIds.length > 0) {
          const memberUsers = await UserModel.find({ _id: { $in: memberUserIds } })
            .select('displayName username email')
            .lean();
            
          const roleMap = new Map(members.map(m => [String(m.userId), m.role]));
          
          conversationMembersInfo = memberUsers.map(u => {
            const role = roleMap.get(String(u._id)) || 'member';
            const roleName = role === 'admin' ? 'Quản trị viên (Admin)' : 'Thành viên';
            return `- ${u.displayName} (@${u.username || ''}) - Vai trò: ${roleName} - Email: ${u.email || 'N/A'}`;
          }).join('\n');
        }
      }
    }

    // 4. Construct prompt
    const systemPrompt = `Bạn là Zync AI Assistant, trợ lý thông minh cao cấp được tích hợp trong ứng dụng Zync Chat.
Bạn có quyền truy cập trực tiếp vào cơ sở dữ liệu thời gian thực của người dùng để trả lời các câu hỏi về:
1. Bạn bè của người dùng (tổng số lượng, danh sách bạn bè, thông tin chi tiết).
2. Các bài đăng/cập nhật gần đây của bạn bè.
3. Chi tiết phòng chat/nhóm chat hiện tại (tên nhóm, danh sách các thành viên tham gia, quản trị viên nhóm).
4. Nội dung cuộc hội thoại hiện tại (tóm tắt tin nhắn gần đây hoặc toàn bộ 50 tin nhắn).

Dưới đây là dữ liệu CSDL trực tiếp liên quan đến người dùng hiện tại (bạn chỉ được sử dụng dữ liệu này để trả lời, không tự bịa ra thông tin):

=== DANH SÁCH BẠN BÈ ===
Tổng số bạn bè: ${friendsCount} người.
Danh sách chi tiết bạn bè:
${friendsInfo || 'Chưa có bạn bè nào.'}

=== BÀI VIẾT MỚI TỪ BẠN BÈ ===
${recentPostsInfo}

=== THÀNH VIÊN CUỘC TRÒ CHUYỆN / NHÓM CHAT HIỆN TẠI ===
${conversationContextInfo}
Danh sách thành viên tham gia cuộc trò chuyện:
${conversationMembersInfo}

=== 50 TIN NHẮN GẦN NHẤT TRONG CUỘC TRÒ CHUYỆN ===
${chatHistoryContext}

=== HƯỚNG DẪN TRẢ LỜI ===
- Trả lời bằng tiếng Việt lịch sự, thân thiện, tự nhiên nhưng chuyên nghiệp.
- Khi người dùng hỏi về thông tin nhóm chat hoặc danh sách thành viên trong nhóm, hãy dùng dữ liệu ở phần "THÀNH VIÊN CUỘC TRÒ CHUYỆN / NHÓM CHAT HIỆN TẠI" để trả lời (ví dụ: liệt kê tên các thành viên, ai là quản trị viên/admin nhóm).
- Khi người dùng hỏi về danh sách bạn bè, số lượng bạn bè, hoặc bài đăng mới của bạn bè, hãy trích xuất dữ liệu CSDL ở trên để trả lời cực kỳ chính xác.
- Khi người dùng nhờ tóm tắt đoạn chat, hãy lưu ý xem họ muốn tóm tắt "tin nhắn gần đây" (10-15 tin nhắn cuối trong danh sách) hay "toàn bộ đoạn chat/cả đoạn chat" (toàn bộ 50 tin nhắn) để phân tích đúng yêu cầu và nêu ra các ý chính một cách ngắn gọn, mạch lạc.
- Định dạng câu trả lời bằng Markdown đẹp mắt (bôi đậm, gạch đầu dòng, bảng biểu nếu cần) để người dùng có trải nghiệm xem premium nhất.`;

    try {
      const model = getModel(AI_MODELS.PRIMARY || 'gemini-2.5-pro');
      const response = await model.generateContent([
        { text: systemPrompt },
        { text: `Yêu cầu của người dùng: "${message}"` }
      ]);
      return response.response.text();
    } catch (err: any) {
      logger.error('[AI Chat] Gemini call failed, falling back to flash model', { error: err.message });
      try {
        const fallbackModel = getModel(AI_MODELS.FALLBACK || 'gemini-2.5-flash');
        const response = await fallbackModel.generateContent([
          { text: systemPrompt },
          { text: `Yêu cầu của người dùng: "${message}"` }
        ]);
        return response.response.text();
      } catch (fallbackErr: any) {
        logger.error('[AI Chat] Fallback Gemini call failed as well, trying stable production models...', { error: fallbackErr.message });
        
        const stableModels = ['gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
        for (const stableModelId of stableModels) {
          try {
            logger.info(`[AI Chat] Retrying with highly stable model: ${stableModelId}`);
            const stableModel = getModel(stableModelId);
            const response = await stableModel.generateContent([
              { text: systemPrompt },
              { text: `Yêu cầu của người dùng: "${message}"` }
            ]);
            return response.response.text();
          } catch (retryErr: any) {
            logger.error(`[AI Chat] Retry fallback to ${stableModelId} failed`, { error: retryErr.message });
          }
        }
        
        const apiKey = process.env['GEMINI_API_KEY'];
        if (!apiKey || apiKey === 'your_google_gemini_api_key') {
          throw new AppError(
            'Cấu hình API Key cho Gemini bị thiếu hoặc chưa chính xác. Vui lòng đăng ký key tại https://aistudio.google.com/app/apikey và cập nhật GEMINI_API_KEY trong file .env.',
            400,
            'AI_CONFIG_ERROR'
          );
        }
        throw new AppError('Hiện tại trợ lý AI đang bận, bạn vui lòng thử lại sau nhé.', 500, 'AI_CALL_FAILED');
      }
    }
  }

  /**
   * Education AI Assistant with strict domain constraints and multimodal file analysis
   */
  static async educationAi(
    userId: string,
    message: string,
    fileUrl?: string,
    fileName?: string
  ): Promise<string> {
    logger.info('[AI Education] Processing education request', { userId, fileUrl, fileName });

    const systemPrompt = `Bạn là Zync Education AI Assistant - một chuyên gia tư vấn giáo dục và học thuật cao cấp.
Nhiệm vụ của bạn là giải đáp toàn bộ câu hỏi liên quan đến GIÁO DỤC, HỌC TẬP, GIẢNG DẠY, KHOA HỌC, NGHIÊN CỨU, CÔNG NGHỆ, PHƯƠNG PHÁP HỌC TẬP, ĐỊNH HƯỚNG NGHỀ NGHIỆP VÀ CÁC MÔN HỌC (Toán, Lý, Hóa, Anh, Văn, Sinh, Sử, Địa, Tin học...).

=== QUY TẮC BẮT BUỘC ===
1. Bạn CHỈ được phép trả lời các câu hỏi nằm trong phạm vi Giáo dục và Học thuật.
2. Nếu người dùng hỏi bất kỳ câu hỏi nào ngoài phạm vi giáo dục (ví dụ: đặt vé máy bay, thời tiết, giải trí đơn thuần, tin tức xã hội không liên quan học tập, tán gẫu không lành mạnh...), bạn phải TỪ CHỐI LỊCH SỰ và nhắc nhở họ rằng bạn là trợ lý chuyên biệt về giáo dục và chỉ hỗ trợ các câu hỏi liên quan đến học tập.
3. Luôn giữ thái độ thân thiện, sư phạm, nhiệt tình, giải thích rõ ràng và có tính giáo dục cao.
4. Định dạng câu trả lời bằng Markdown rõ ràng, dễ hiểu.`;

    const promptParts: any[] = [{ text: systemPrompt }];

    // If there is an uploaded file to analyze
    if (fileUrl) {
      try {
        logger.info('[AI Education] Downloading file for analysis', { fileUrl });
        const res = await fetch(fileUrl);
        if (!res.ok) {
          throw new Error('Failed to fetch file content');
        }

        const contentType = res.headers.get('content-type') || '';
        const isImage = contentType.startsWith('image/');
        const isPdf = contentType === 'application/pdf' || (fileName && /\.pdf$/i.test(fileName));
        const isDocx = contentType.includes('word') || 
                        contentType.includes('officedocument') || 
                        (fileName && /\.(docx|doc)$/i.test(fileName));
        const isText = contentType.startsWith('text/') || 
                       contentType.includes('json') || 
                       contentType.includes('javascript') || 
                       contentType.includes('typescript') ||
                       (fileName && /\.(txt|md|json|csv|ts|js|py|html|css)$/i.test(fileName));

        if (isImage || isPdf) {
          const buffer = await res.arrayBuffer();
          const base64Data = Buffer.from(buffer).toString('base64');
          promptParts.push({
            inlineData: {
              data: base64Data,
              mimeType: isPdf ? 'application/pdf' : (contentType || 'image/jpeg')
            }
          });
          promptParts.push({ 
            text: `Người dùng gửi kèm một tài liệu giáo dục dạng ${isPdf ? 'PDF' : 'hình ảnh'} tên là "${fileName || (isPdf ? 'document.pdf' : 'image.jpg')}". Hãy phân tích tài liệu/hình ảnh này và trả lời câu hỏi của họ dưới góc độ giáo dục.` 
          });
        } else if (isDocx) {
          const buffer = await res.arrayBuffer();
          const nodeBuffer = Buffer.from(buffer);
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer: nodeBuffer });
          const textContent = result.value;
          promptParts.push({
            text: `[Tệp tài liệu văn bản Word đính kèm: "${fileName || 'document.docx'}"]\n\nNỘI DUNG VĂN BẢN ĐÃ TRÍCH XUẤT TỪ FILE:\n"""\n${textContent}\n"""\n\nHãy phân tích nội dung tài liệu Word này và trả lời câu hỏi liên quan dưới góc độ giáo dục học.`
          });
        } else if (isText) {
          const textContent = await res.text();
          promptParts.push({
            text: `[Tệp tài liệu đính kèm: "${fileName || 'document.txt'}"]\n\nNỘI DUNG FILE:\n"""\n${textContent}\n"""\n\nHãy phân tích nội dung tệp tin trên và trả lời câu hỏi liên quan dưới góc độ giáo dục học.`
          });
        } else {
          promptParts.push({
            text: `[Thông tin tệp đính kèm] Tên tệp: "${fileName || 'document'}", Định dạng: "${contentType}". Hãy ghi nhận thông tin tệp tài liệu học tập này và trả lời câu hỏi.`
          });
        }
      } catch (err: any) {
        logger.error('[AI Education] Error reading attached file', { error: err.message });
        promptParts.push({ text: `(Cảnh báo: Có tệp đính kèm tên là "${fileName}" nhưng hệ thống không thể tải trực tiếp nội dung tệp này do lỗi kỹ thuật. Vui lòng phản hồi dựa trên tên file và câu hỏi của người dùng).` });
      }
    }

    promptParts.push({ text: `Câu hỏi học tập của người dùng: "${message}"` });

    try {
      const model = getModel(AI_MODELS.FALLBACK || 'gemini-2.5-flash');
      const response = await model.generateContent(promptParts);
      return response.response.text();
    } catch (err: any) {
      logger.error('[AI Education] Primary Gemini call failed, trying stable production models...', { error: err.message });
      
      const stableModels = ['gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
      for (const stableModelId of stableModels) {
        try {
          logger.info(`[AI Education] Retrying with highly stable model: ${stableModelId}`);
          const stableModel = getModel(stableModelId);
          const response = await stableModel.generateContent(promptParts);
          return response.response.text();
        } catch (fallbackErr: any) {
          logger.error(`[AI Education] Fallback to ${stableModelId} failed`, { error: fallbackErr.message });
        }
      }

      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey || apiKey === 'your_google_gemini_api_key') {
        throw new AppError(
          'Cấu hình API Key cho Gemini bị thiếu hoặc chưa chính xác. Vui lòng đăng ký key tại https://aistudio.google.com/app/apikey và cập nhật GEMINI_API_KEY trong file .env.',
          400,
          'AI_CONFIG_ERROR'
        );
      }
      throw new AppError('Hiện tại trợ lý Giáo dục AI đang bận, bạn vui lòng thử lại sau nhé.', 500, 'AI_CALL_FAILED');
    }
  }
}
