import { create } from 'zustand'
import { createSessionSlice, SessionSlice } from './sessionSlice'
import { createApprovalsSlice, ApprovalsSlice } from './approvalsSlice'
import { createUISlice, UISlice } from './uiSlice'

export type BoundStore = SessionSlice & ApprovalsSlice & UISlice

export const useBoundStore = create<BoundStore>()((...a) => ({
  ...createSessionSlice(...a),
  ...createApprovalsSlice(...a),
  ...createUISlice(...a),
}))