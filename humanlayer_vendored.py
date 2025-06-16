from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class SlackContactChannel(BaseModel):
    """
    Route for contacting a user or channel via slack
    """

    # can send to a channel or a user id,
    # must be an ID like C123456 or U123456, not #channel or @user
    channel_or_user_id: str

    # target context for the LLM, e.g. target_context="the channel with the director of engineering"
    # will update the tool description to
    # "contact a human in slack in the channel with the director of engineering"
    #
    # other examples e.g. "a dm with the user you're assisting"
    context_about_channel_or_user: str | None = None

    # a bot token to override the default contact channel
    # if you use a custom bot token, you must set your app's
    # slack webhook destination appropriately so your humanlayer server can receive them
    bot_token: str | None = Field(default=None, exclude=True)
    #
    # bot_token_ref: str | None

    # a list of responders to allow to respond to this message
    # other messages will be ignored
    allowed_responder_ids: list[str] | None = None

    experimental_slack_blocks: bool | None = None
    thread_ts: str | None = None

    @field_validator("allowed_responder_ids")
    @classmethod
    def validate_allowed_responder_ids(cls, v: list[str] | None) -> list[str] | None:
        if v is not None and len(v) == 0:
            raise ValueError("allowed_responder_ids if provided must not be empty")
        return v


class SMSContactChannel(BaseModel):
    """
    Route for contacting a user via SMS
    """

    phone_number: str

    # any context for the LLM about the user this channel can contact
    # e.g. "the user you are assisting" will update the tool name to
    # contact_human_via_sms_to_the_user_you_are_assisting
    context_about_user: str | None = None


class WhatsAppContactChannel(BaseModel):
    """
    Route for contacting a user via WhatsApp
    """

    phone_number: str

    # any context for the LLM about the user this channel can contact
    # e.g. "the user you are assisting" will update the tool name to
    # contact_human_via_whatsapp_to_the_user_you_are_assisting
    context_about_user: str | None = None


class EmailContactChannel(BaseModel):
    """
    Route for contacting a user via email
    """

    address: str

    # any context for the LLM about the user this channel can contact
    # e.g. "the user you are assisting" will update the tool name to
    # contact_human_via_email_to_the_user_you_are_assisting
    context_about_user: str | None = None

    additional_recipients: list["EmailRecipient"] | None = None

    # a subject line to override the default subject line
    # - useful if you are getting approval for a workflow that
    #   was initiated by an email and you want to reply on that same thread
    # make sure you know what you're doing
    experimental_subject_line: str | None = None
    experimental_references_message_id: str | None = None
    experimental_in_reply_to_message_id: str | None = None

    # a template to render the email body
    template: str | None = None


class EmailRecipient(BaseModel):
    address: str
    # any context for the LLM about the user this channel can contact
    # e.g. "the user you are assisting" will update the tool name to
    # contact_human_via_email_to_the_user_you_are_assisting
    context_about_user: str | None = None
    field: Literal["to"] | Literal["cc"] | Literal["bcc"] | None = None


class ContactChannel(BaseModel):
    slack: SlackContactChannel | None = None
    sms: SMSContactChannel | None = None
    whatsapp: WhatsAppContactChannel | None = None
    email: EmailContactChannel | None = None
    channel_id: int | None = None

    def context(self) -> str | None:
        if self.slack:
            return self.slack.context_about_channel_or_user
        if self.sms:
            return self.sms.context_about_user
        if self.whatsapp:
            return self.whatsapp.context_about_user
        if self.email:
            return self.email.context_about_user
        return None


class ResponseOption(BaseModel):
    name: str
    title: str | None = None
    description: str | None = None
    prompt_fill: str | None = None
    interactive: bool = False


class FunctionCallSpec(BaseModel):
    fn: str
    kwargs: dict
    channel: ContactChannel | None = None
    reject_options: list[ResponseOption] | None = None
    state: dict | None = None  # Optional state to be preserved across the request lifecycle


class FunctionCallStatus(BaseModel):
    requested_at: datetime | None = None  # Optional for backwards compatibility
    responded_at: datetime | None = None
    approved: bool | None = None
    comment: str | None = None
    user_info: dict | None = None
    slack_context: dict | None = None  # TODO(dbentley): is this used anywhere?
    reject_option_name: str | None = None
    slack_message_ts: str | None = None
    failed_validation_details: dict | None = None


class FunctionCall(BaseModel):
    run_id: str
    call_id: str
    spec: FunctionCallSpec
    status: FunctionCallStatus | None = None


class Escalation(BaseModel):
    escalation_msg: str
    additional_recipients: list[EmailRecipient] | None = None
    channel: ContactChannel | None = None  # New field for dynamic channel specification


class HumanContactSpec(BaseModel):
    msg: str
    subject: str | None = None
    channel: ContactChannel | None = None
    response_options: list[ResponseOption] | None = None
    state: dict | None = None  # Optional state to be preserved across the request lifecycle


class HumanContactStatus(BaseModel):
    # nullable for backwards compatibility
    requested_at: datetime | None = None

    responded_at: datetime | None = None
    response: str | None = None
    response_option_name: str | None = None
    slack_message_ts: str | None = None
    failed_validation_details: dict | None = None


class HumanContact(BaseModel):
    run_id: str
    call_id: str
    spec: HumanContactSpec
    status: HumanContactStatus | None = None


class ExtractionSpec(BaseModel):
    question: str
    citation: str
    document: str


class ExtractionStatus(BaseModel):
    approved: bool
    modifications: list[str]
    comment: str


class Extraction(BaseModel):
    call_id: str
    run_id: str
    spec: ExtractionSpec
    status: ExtractionStatus | None = None
