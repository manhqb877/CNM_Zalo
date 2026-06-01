'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api';
import { generateUploadSignature, verifyUpload } from '@/services/chat';
import Image from 'next/image';

function PaperclipIcon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
}

interface EducationAiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FileAttachment {
  name: string;
  url: string;
  type: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  file?: FileAttachment;
}

export default function EducationAiModal({ isOpen, onClose }: EducationAiModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<FileAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const quickChips = [
    { label: '🧮 Giải Toán nâng cao', prompt: 'Hãy giải giúp tôi bài toán nâng cao sau đây: ' },
    { label: '💻 Giải thích Lập trình', prompt: 'Hãy giải thích đoạn mã lập trình sau và tối ưu nó giúp tôi: ' },
    { label: '🇬🇧 Học Tiếng Anh', prompt: 'Hãy sửa lỗi ngữ pháp tiếng Anh và giải thích ngữ pháp cho câu sau: ' },
    { label: '💡 Mẹo Học tập', prompt: 'Cho tôi lời khuyên về phương pháp học tập thông minh và nhớ lâu.' }
  ];

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isAiResponding]);

  // Set greeting when modal opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          text: 'Xin chào! Tôi là **Zync Education AI** 🎓\n\nTôi là trợ lý ảo chuyên gia tư vấn học tập và giáo dục. Bạn có thể hỏi tôi bất cứ điều gì liên quan đến toán học, lập trình, ngôn ngữ, mẹo học tập, định hướng học tập... hoặc gửi file hình ảnh/văn bản bài tập lên để tôi phân tích!\n\n*(Lưu ý: Tôi chỉ trả lời các chủ đề liên quan đến giáo dục thôi nhé!)*'
        }
      ]);
    }
  }, [isOpen, messages.length]);

  if (!isOpen) return null;

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const isImage = file.type.startsWith('image/');
    const uploadType = isImage ? 'image' : 'document';

    try {
      const signatureData = await generateUploadSignature(uploadType);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signatureData.apiKey);
      formData.append('signature', signatureData.signature);
      formData.append('timestamp', signatureData.timestamp.toString());
      formData.append('folder', signatureData.folder);

      const uploadedData = await new Promise<{ public_id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadUrl = isImage 
          ? `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`
          : `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/raw/upload`;
        
        xhr.open('POST', uploadUrl);

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as { public_id: string });
            } catch {
              reject(new Error('Phản hồi từ máy chủ tải tệp không hợp lệ.'));
            }
            return;
          }
          reject(new Error('Tải tệp lên đám mây thất bại.'));
        };

        xhr.onerror = () => {
          reject(new Error('Lỗi kết nối khi tải tệp lên.'));
        };

        xhr.send(formData);
      });

      const verifyResult = await verifyUpload(uploadedData.public_id, uploadType);
      
      setAttachedFile({
        name: file.name,
        url: verifyResult.secureUrl,
        type: file.type
      });
    } catch (err: any) {
      setUploadError(err.message || 'Không thể tải tệp lên. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    const messageText = inputValue.trim();
    if (!messageText && !attachedFile) return;

    const userMessageId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      sender: 'user',
      text: messageText,
      file: attachedFile || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setAttachedFile(null);
    setIsAiResponding(true);

    try {
      const response = await apiClient.post('/api/ai/education', {
        message: messageText || `Phân tích tệp tin: ${userMsg.file?.name}`,
        fileUrl: userMsg.file?.url,
        fileName: userMsg.file?.name
      }, { timeout: 60000 });

      const aiReply = response.data?.data?.reply || 'Xin lỗi, tôi gặp sự cố khi xử lý câu hỏi này.';
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiReply
      }]);
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || 'Có lỗi xảy ra khi kết nối tới trợ lý AI.';
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'system',
        text: errMsg
      }]);
    } finally {
      setIsAiResponding(false);
    }
  };

  const handleChipClick = (promptText: string) => {
    setInputValue(promptText);
  };

  const formatMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-emerald-500/10 px-1 py-0.5 rounded text-emerald-500 font-mono text-sm">$1</code>')
      .split('\n')
      .join('<br />');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 transition-all duration-300">
      <div className="relative w-full max-w-lg h-[620px] max-h-[85vh] flex flex-col rounded-3xl border border-border bg-bg-card shadow-2xl overflow-hidden transition-all transform scale-100">
        
        {/* Glowing aura */}
        <div className="absolute -left-20 -top-20 w-44 h-44 bg-accent/10 rounded-full blur-[60px] pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 w-44 h-44 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none" />

        {/* Modal Header */}
        <header className="relative flex items-center justify-between border-b border-border px-5 py-4 shrink-0 bg-bg-card z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/15">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                Zync Education AI
                <span className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  Chuyên môn
                </span>
              </h3>
              <p className="text-[11px] text-text-tertiary">Trợ lý ảo học tập & tư vấn giáo dục thông minh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-hover text-text-secondary transition hover:bg-bg-active hover:text-text-primary"
            aria-label="Đóng"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </header>

        {/* Messages Area */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5 bg-bg-secondary"
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2 animate-fade-in">
                  <div className="flex flex-col gap-1.5 rounded-2xl border border-danger-border bg-danger-bg p-3.5 text-[12.5px] text-danger-text max-w-sm shadow-sm">
                    <div className="flex items-center gap-2 font-bold shrink-0">
                      <AlertCircle className="h-4 w-4" />
                      <span>Thông báo hệ thống</span>
                    </div>
                    <p className="leading-relaxed font-semibold">{msg.text}</p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 max-w-[88%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'} animate-fade-in`}
              >
                {/* Avatar */}
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/15">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}

                {/* Bubble Container */}
                <div className="space-y-0.5 max-w-[calc(100%-40px)]">
                  <div
                    className={`rounded-[1.25rem] px-4 py-2.5 text-[13.5px] leading-relaxed shadow-sm border ${
                      isUser
                        ? 'bg-accent text-white border-accent-hover rounded-tr-none'
                        : 'bg-bg-card text-text-primary border-border rounded-tl-none'
                    }`}
                  >
                    {/* Render attachment in message */}
                    {msg.file && (
                      <div className={`mb-2 p-2 rounded-xl flex items-center gap-2.5 border text-xs ${
                        isUser 
                          ? 'bg-emerald-600/35 border-white/10 text-white' 
                          : 'bg-bg-hover border-border/70 text-text-primary'
                      }`}>
                        {msg.file.type.startsWith('image/') ? (
                          <div className="relative h-10 w-10 rounded overflow-hidden shrink-0 border border-black/10">
                            <img src={msg.file.url} alt={msg.file.name} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                            <FileText className="h-4.5 w-4.5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate">{msg.file.name}</p>
                          <p className="text-[10px] opacity-75">Tệp đính kèm phân tích</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Message text */}
                    <div 
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }} 
                      className="font-medium whitespace-pre-line break-words"
                    />
                  </div>
                  <p className={`text-[9px] text-text-tertiary font-bold ${isUser ? 'text-right' : ''}`}>
                    {isUser ? 'Bạn' : 'Zync Edu AI'}
                  </p>
                </div>
              </div>
            );
          })}

          {/* AI Response Pending */}
          {isAiResponding && (
            <div className="flex gap-2.5 max-w-[88%] mr-auto items-center animate-pulse">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/15">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="bg-bg-card text-text-primary border border-border rounded-[1.25rem] rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                <span className="text-[12.5px] font-bold text-text-secondary">AI đang phân tích học thuật...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input & Upload Controls */}
        <div className="p-4 border-t border-border shrink-0 bg-bg-card z-10 space-y-3">
          
          {/* Quick chips when there are few user messages */}
          {messages.length <= 2 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {quickChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleChipClick(chip.prompt)}
                  className="shrink-0 rounded-full border border-border bg-bg-hover hover:border-accent/40 hover:bg-accent/5 px-3 py-1.5 text-[11px] font-bold text-text-secondary hover:text-accent transition-all duration-150 cursor-pointer shadow-sm"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Attachment Preview Box */}
          {attachedFile && (
            <div className="flex items-center justify-between p-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 max-w-sm animate-fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                {attachedFile.type.startsWith('image/') ? (
                  <div className="relative h-8 w-8 rounded overflow-hidden shrink-0 border border-border">
                    <img src={attachedFile.url} alt="attached" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <FileText className="h-4.5 w-4.5" />
                  </div>
                )}
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-text-primary truncate">{attachedFile.name}</p>
                  <p className="text-[9px] text-emerald-500 font-bold">Sẵn sàng gửi để phân tích</p>
                </div>
              </div>
              <button
                onClick={() => setAttachedFile(null)}
                className="h-6 w-6 rounded-full bg-bg-hover hover:bg-bg-active text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Upload loading/error */}
          {isUploading && (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 bg-emerald-500/5 p-2.5 rounded-xl max-w-xs animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Tải tài liệu lên...
            </div>
          )}

          {uploadError && (
            <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-500/5 p-2.5 rounded-xl max-w-sm">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Text Input area */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadFile}
              className="hidden"
              accept="image/*,application/pdf,.docx,.doc,text/plain,text/markdown,application/json,.csv,.js,.ts,.html,.css"
            />
            
            <div className="flex-1 flex items-center gap-2 bg-bg-hover border border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10 focus-within:bg-bg-card rounded-full p-1.5 pl-3.5 transition-all shadow-sm">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-hover hover:bg-bg-active text-text-secondary hover:text-accent transition-all duration-200 shrink-0"
                title="Đính kèm tệp học tập"
                disabled={isUploading || isAiResponding}
              >
                <PaperclipIcon className="h-4.5 w-4.5" />
              </button>

              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
                placeholder={attachedFile ? "Đặt câu hỏi về tài liệu đính kèm..." : "Hỏi về toán, lý, hóa, tin học, mẹo học..."}
                className="w-full bg-transparent py-1 px-1.5 text-xs font-bold text-text-primary outline-none placeholder:text-text-tertiary"
                disabled={isAiResponding}
              />
              
              <button
                onClick={handleSend}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent hover:bg-accent-hover text-white transition-all shadow-md shadow-accent/20 hover:shadow-accent/40 shrink-0 disabled:opacity-50 disabled:shadow-none"
                disabled={isAiResponding || isUploading || (!inputValue.trim() && !attachedFile)}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
