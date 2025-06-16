import { FunctionCall, HumanContact, FunctionCallStatus, HumanContactStatus } from './models'

type EmailMessage = {
  from_address: string
  to_address: string[]
  cc_address: string[]
  bcc_address: string[]
  subject: string
  content: string
  datetime: string
}

type EmailPayload = {
  from_address: string
  to_address: string
  subject: string
  body: string
  message_id: string
  previous_thread?: EmailMessage[]
  raw_email: string
  is_test?: boolean
}

type SlackMessage = {
  from_user_id: string
  channel_id: string
  content: string
  message_ts: string
}

type SlackThread = {
  thread_ts: string
  channel_id: string
  events: SlackMessage[]
  team_id: string
}

type V1Beta2EmailEventReceived = {
  is_test?: boolean
  type: 'agent_email.received'
  event: EmailPayload
}

type V1Beta2SlackEventReceived = {
  is_test?: boolean
  type: 'agent_slack.received'
  event: SlackThread
}

type V1Beta2FunctionCallCompleted = {
  is_test?: boolean
  type: 'function_call.completed'
  event: FunctionCall
}

type V1Beta2HumanContactCompleted = {
  is_test?: boolean
  type: 'human_contact.completed'
  event: HumanContact
}

// V1Beta3 Types
type ConversationCreatedEventPayload = {
  user_message: string
  contact_channel_id?: number
  agent_name?: string
  email?: EmailPayload
  slack?: SlackThread
}

type V1Beta3ConversationCreated = {
  is_test?: boolean
  type: 'conversation.created'
  event: ConversationCreatedEventPayload
}

type ApprovedStatus = FunctionCallStatus & {
  requested_at: Date
  responded_at: Date
  approved: true
  comment?: string
}

type RejectedStatus = FunctionCallStatus & {
  requested_at: Date
  responded_at: Date
  approved: false
  comment: string
}

type StatusUnion = ApprovedStatus | RejectedStatus

type V1Beta3FunctionCallCompletedEvent = FunctionCall & {
  status: StatusUnion
  contact_channel_id?: number
}

type V1Beta3FunctionCallCompleted = {
  is_test?: boolean
  type: 'function_call.completed'
  event: V1Beta3FunctionCallCompletedEvent
}

type CompletedHumanContactStatus = HumanContactStatus & {
  requested_at: Date
  responded_at: Date
  response: string
}

type V1Beta3HumanContactCompletedEvent = HumanContact & {
  status: CompletedHumanContactStatus
  contact_channel_id?: number
}

type V1Beta3HumanContactCompleted = {
  is_test?: boolean
  type: 'human_contact.completed'
  event: V1Beta3HumanContactCompletedEvent
}

export {
  V1Beta2EmailEventReceived,
  V1Beta2SlackEventReceived,
  V1Beta2FunctionCallCompleted,
  V1Beta2HumanContactCompleted,
  V1Beta3ConversationCreated,
  V1Beta3FunctionCallCompleted,
  V1Beta3HumanContactCompleted,
  ConversationCreatedEventPayload,
  ApprovedStatus,
  RejectedStatus,
  StatusUnion,
  V1Beta3FunctionCallCompletedEvent,
  CompletedHumanContactStatus,
  V1Beta3HumanContactCompletedEvent,
}
