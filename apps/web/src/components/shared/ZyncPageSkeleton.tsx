'use client';

import React from 'react';
import { ZyncSkeleton } from './ZyncSkeleton';

/* ============================================================
 * SkeletonChatPage
 * Sidebar list + message area
 * ============================================================ */
export function SkeletonChatPage() {
  return (
    <div className="flex h-full w-full gap-0">
      {/* Sidebar skeleton */}
      <div className="flex h-full w-[320px] flex-col border-r" style={{ borderColor: 'var(--border)' }}>
        {/* Sidebar header */}
        <div className="flex items-center gap-3 border-b p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="zync-skeleton h-9 w-9 rounded-full" />
          <div className="zync-skeleton h-4 w-32 rounded-[4px]" />
        </div>
        {/* Search bar */}
        <div className="p-3">
          <div className="zync-skeleton h-9 w-full rounded-[1rem]" />
        </div>
        {/* Conversation list */}
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid var(--border-light)` }}>
              <div className="zync-skeleton h-12 w-12 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="zync-skeleton h-3.5 w-32 rounded-[4px]" />
                <div className="zync-skeleton h-2.5 w-48 rounded-[4px]" />
              </div>
              <div className="zync-skeleton h-2.5 w-10 rounded-[4px]" />
            </div>
          ))}
        </div>
      </div>

      {/* Chat area skeleton */}
      <div className="flex h-full flex-1 flex-col">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="zync-skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <div className="zync-skeleton h-4 w-36 rounded-[4px]" />
            <div className="zync-skeleton h-3 w-20 rounded-[4px]" />
          </div>
        </div>
        {/* Messages */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-end gap-2"
              style={{ flexDirection: i % 2 === 0 ? 'row' : 'row-reverse' }}
            >
              <div className="zync-skeleton h-8 w-8 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <div className="zync-skeleton rounded-[14px]" style={{ width: '14rem', height: '2.5rem' }} />
                {i % 3 === 0 && (
                  <div className="zync-skeleton rounded-[14px]" style={{ width: '9rem', height: '2.5rem' }} />
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Input area */}
        <div className="flex items-center gap-3 border-t p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="zync-skeleton h-10 flex-1 rounded-[1rem]" />
          <div className="zync-skeleton h-10 w-10 rounded-full" />
          <div className="zync-skeleton h-10 w-20 rounded-[1rem]" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * SkeletonFriendsPage
 * Search bar + tabs + friend list
 * ============================================================ */
export function SkeletonFriendsPage() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div>
        <div className="zync-skeleton mb-1 h-8 w-40 rounded-[4px]" />
        <div className="zync-skeleton h-4 w-64 rounded-[4px]" />
      </div>

      {/* Search */}
      <div className="zync-skeleton h-10 w-full rounded-[1rem]" />

      {/* Tabs */}
      <div className="flex gap-3">
        {[120, 100, 140, 100].map((w, i) => (
          <div key={i} className="zync-skeleton h-9 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Friend list */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[1.2rem] border p-4"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
          >
            <div className="zync-skeleton h-14 w-14 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="zync-skeleton h-4 w-40 rounded-[4px]" />
              <div className="zync-skeleton h-3 w-56 rounded-[4px]" />
            </div>
            <div className="zync-skeleton h-9 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * SkeletonCommunityPage
 * Feed cards
 * ============================================================ */
export function SkeletonCommunityPage() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="zync-skeleton h-7 w-52 rounded-[4px]" />
        <div className="zync-skeleton h-9 w-32 rounded-full" />
      </div>

      {/* Feed tabs */}
      <div className="flex gap-2">
        {[80, 90, 80, 70].map((w, i) => (
          <div key={i} className="zync-skeleton h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Post cards */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-[1.4rem] border p-5"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-card)' }}
          >
            {/* Author row */}
            <div className="flex items-center gap-3">
              <div className="zync-skeleton h-11 w-11 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <div className="zync-skeleton h-3.5 w-36 rounded-[4px]" />
                <div className="zync-skeleton h-2.5 w-24 rounded-[4px]" />
              </div>
            </div>
            {/* Content */}
            <div className="flex flex-col gap-2">
              <div className="zync-skeleton h-5 w-full rounded-[4px]" />
              <div className="zync-skeleton h-5 w-4/5 rounded-[4px]" />
              <div className="zync-skeleton h-5 w-3/5 rounded-[4px]" />
            </div>
            {/* Image placeholder */}
            <div className="zync-skeleton h-52 w-full rounded-[1rem]" />
            {/* Actions */}
            <div className="flex gap-4">
              {[60, 60, 60].map((w, j) => (
                <div key={j} className="zync-skeleton h-8 rounded-full" style={{ width: w }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * SkeletonProfilePage
 * Avatar + stats + info sections
 * ============================================================ */
export function SkeletonProfilePage() {
  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-4">
        <div className="zync-skeleton h-24 w-24 rounded-full" />
        <div className="zync-skeleton h-6 w-44 rounded-[4px]" />
        <div className="zync-skeleton h-4 w-60 rounded-[4px]" />
      </div>

      {/* Stats row */}
      <div className="flex justify-center gap-8">
        {[80, 80, 80].map((w, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="zync-skeleton h-8 w-12 rounded-[4px]" />
            <div className="zync-skeleton h-3 w-16 rounded-[4px]" />
          </div>
        ))}
      </div>

      {/* Info cards */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[1rem] border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="zync-skeleton h-5 w-5 rounded-[4px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="zync-skeleton h-3 w-24 rounded-[4px]" />
              <div className="zync-skeleton h-4 w-40 rounded-[4px]" />
            </div>
          </div>
        ))}
      </div>

      {/* Bio section */}
      <div className="flex flex-col gap-2 rounded-[1rem] border p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="zync-skeleton h-4 w-20 rounded-[4px]" />
        <div className="zync-skeleton h-3 w-full rounded-[4px]" />
        <div className="zync-skeleton h-3 w-4/5 rounded-[4px]" />
      </div>
    </div>
  );
}

/* ============================================================
 * SkeletonExplorePage
 * Search + card grid
 * ============================================================ */
export function SkeletonExplorePage() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 sm:p-6">
      {/* Search */}
      <div className="zync-skeleton h-11 w-full rounded-[1rem]" />

      {/* Filter chips */}
      <div className="flex gap-2">
        {[60, 80, 70, 90].map((w, i) => (
          <div key={i} className="zync-skeleton h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-[1.4rem] border p-4"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-card)' }}
          >
            <div className="flex items-center gap-3">
              <div className="zync-skeleton h-12 w-12 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="zync-skeleton h-4 w-32 rounded-[4px]" />
                <div className="zync-skeleton h-3 w-24 rounded-[4px]" />
              </div>
            </div>
            <div className="zync-skeleton h-3 w-full rounded-[4px]" />
            <div className="zync-skeleton h-3 w-4/5 rounded-[4px]" />
            <div className="flex flex-wrap gap-2">
              {[50, 60, 50].map((w, j) => (
                <div key={j} className="zync-skeleton h-6 rounded-full" style={{ width: w }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * SkeletonHomePage
 * Stats cards + activity list
 * ============================================================ */
export function SkeletonHomePage() {
  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4 pb-20 sm:p-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <div className="zync-skeleton h-3 w-20 rounded-[4px]" />
          <div className="zync-skeleton h-8 w-52 rounded-[4px]" />
          <div className="zync-skeleton h-4 w-64 rounded-[4px]" />
        </div>
        <div className="zync-skeleton h-8 w-28 rounded-full" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {[80, 80, 80].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 rounded-[1.2rem] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
            <div className="zync-skeleton h-10 w-10 rounded-[12px]" />
            <div className="zync-skeleton h-8 w-12 rounded-[4px]" />
            <div className="zync-skeleton h-3 w-16 rounded-[4px]" />
          </div>
        ))}
      </div>

      {/* Activity sections */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="flex flex-col gap-4 rounded-[1.8rem] border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
            {/* Section header */}
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-2">
                <div className="zync-skeleton h-5 w-5 rounded-[4px]" />
                <div className="zync-skeleton h-5 w-36 rounded-[4px]" />
              </div>
              <div className="zync-skeleton h-7 w-20 rounded-full" />
            </div>
            {/* Activity items */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="zync-skeleton h-10 w-10 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="zync-skeleton h-3.5 w-40 rounded-[4px]" />
                  <div className="zync-skeleton h-2.5 w-28 rounded-[4px]" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * SkeletonSettingsPage
 * Generic settings form
 * ============================================================ */
export function SkeletonSettingsPage() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-4 sm:p-6">
      <div className="zync-skeleton h-7 w-40 rounded-[4px]" />

      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 rounded-[1rem] border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-col gap-1.5">
              <div className="zync-skeleton h-4 w-36 rounded-[4px]" />
              <div className="zync-skeleton h-3 w-52 rounded-[4px]" />
            </div>
            <div className="zync-skeleton h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
