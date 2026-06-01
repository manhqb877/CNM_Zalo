"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { MediaViewer } from '@/components/home-dashboard/molecules/media-viewer';

type ViewerParams = {
  mediaUrl: string;
  type: 'image' | 'video';
  senderAvatar?: string;
  senderDisplayName?: string;
  createdAt?: string;
};

type MediaViewerContextValue = {
  openViewer: (params: ViewerParams) => void;
  closeViewer: () => void;
};

const MediaViewerContext = createContext<MediaViewerContextValue>({
  openViewer: () => {},
  closeViewer: () => {},
});

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ViewerParams>({ mediaUrl: '', type: 'image' });

  const openViewer = (params: ViewerParams) => {
    setState(params);
    setOpen(true);
  };

  const closeViewer = () => setOpen(false);

  return (
    <MediaViewerContext.Provider value={{ openViewer, closeViewer }}>
      {children}
      <MediaViewer
        open={open}
        mediaUrl={state.mediaUrl || ''}
        type={state.type}
        senderAvatar={state.senderAvatar}
        senderDisplayName={state.senderDisplayName}
        createdAt={state.createdAt}
        onClose={closeViewer}
      />
    </MediaViewerContext.Provider>
  );
}

export function useMediaViewer() {
  return useContext(MediaViewerContext);
}
