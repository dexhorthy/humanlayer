"""
Models for agent webhook payloads.

These models define the structure of payloads sent to agent webhooks when events occur,
such as receiving an email. They are used by the HumanLayer platform to serialize webhook
data in a consistent format that can be consumed by agent implementations.

For example, when an email is received, HumanLayer will send an EmailPayload to the
configured webhook endpoint containing the email content and metadata.
"""

from datetime import datetime
from typing import Annotated, List, Literal, Optional, Union

from app.routers.fl_router.humanlayer_vendored import (
    FunctionCall,
    FunctionCallStatus,
    HumanContact,
    HumanContactStatus,
)
from pydantic import BaseModel, Field


class EmailMessage(BaseModel):
    """A message in an email thread"""

    from_address: str
    to_address: List[str]
    cc_address: List[str]
    bcc_address: List[str]
    subject: str
    content: str
    datetime: str


class EmailPayload(BaseModel):
    """Payload for email agent webhooks"""

    from_address: str
    to_address: str
    subject: str
    body: str
    message_id: str
    previous_thread: Optional[List[EmailMessage]] = None
    raw_email: str
    is_test: bool | None = None  # will be set if the email is a test webhook from the server


class SlackMessage(BaseModel):
    from_user_id: str
    channel_id: str
    content: str
    message_ts: str


class SlackThread(BaseModel):
    thread_ts: str
    channel_id: str
    events: list[SlackMessage]
    team_id: str  # Make team_id required


#####################################
# V1Beta2
#####################################


class V1Beta2EmailEventReceived(BaseModel):
    is_test: bool | None = None
    type: Literal["agent_email.received"] = "agent_email.received"
    event: EmailPayload


class V1Beta2SlackEventReceived(BaseModel):
    is_test: bool | None = None
    type: Literal["agent_slack.received"] = "agent_slack.received"
    event: SlackThread


class V1Beta2FunctionCallCompleted(BaseModel):
    is_test: bool | None = None
    type: Literal["function_call.completed"] = "function_call.completed"
    event: FunctionCall


class V1Beta2HumanContactCompleted(BaseModel):
    is_test: bool | None = None
    type: Literal["human_contact.completed"] = "human_contact.completed"
    event: HumanContact


#####################################
# V1Beta3
#####################################


class ConversationCreatedEventPayload(BaseModel):
    user_message: str
    contact_channel_id: int | None = None
    agent_name: str | None = None
    email: EmailPayload | None = None
    slack: SlackThread | None = None


class V1Beta3ConversationCreated(BaseModel):
    is_test: bool | None = None
    type: Literal["conversation.created"] = "conversation.created"
    event: ConversationCreatedEventPayload


class ApprovedStatus(FunctionCallStatus):
    requested_at: datetime
    responded_at: datetime
    approved: Literal[True]
    comment: Optional[str] = None  # Optional, in case you want to allow comments on approval


class RejectedStatus(FunctionCallStatus):
    requested_at: datetime
    responded_at: datetime
    approved: Literal[False]
    comment: str  # Required for rejection


StatusUnion = Annotated[Union[ApprovedStatus, RejectedStatus], Field(discriminator="approved")]


class V1Beta3FunctionCallCompletedEvent(FunctionCall):
    status: StatusUnion
    contact_channel_id: int | None


class V1Beta3FunctionCallCompleted(BaseModel):
    is_test: Optional[bool] = None
    type: Literal["function_call.completed"] = "function_call.completed"
    event: V1Beta3FunctionCallCompletedEvent


class CompletedHumanContactStatus(HumanContactStatus):
    requested_at: datetime
    responded_at: datetime
    response: str  # always present and truthy


class V1Beta3HumanContactCompletedEvent(HumanContact):
    status: CompletedHumanContactStatus
    contact_channel_id: int | None


class V1Beta3HumanContactCompleted(BaseModel):
    is_test: bool | None = None
    type: Literal["human_contact.completed"] = "human_contact.completed"
    event: V1Beta3HumanContactCompletedEvent
