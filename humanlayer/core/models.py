from datetime import datetime
from typing import Any

from pydantic import BaseModel


class FunctionCallStatus(BaseModel):
    requested_at: datetime
    responded_at: datetime | None = None
    approved: bool | None = None
    comment: str | None = None


class SlackContactChannel(BaseModel):
    """
    Route for contacting a user or channel via slack
    """

    channel_or_user_id: str

    # target context for the LLM, e.g. target_context="the channel with the director of engineering"
    # will update the tool description to
    # "contact a human in slack in the channel with the director of engineering"
    #
    # other examples e.g. "a dm with the user you're assisting"
    context_about_channel_or_user: str | None = None

    # a bot token to override the default contact channel
    # if you use a custom bot token, ensure your app's
    # slack webhook destination is set appropriately so your humanlayer server can receive events
    bot_token: str | None = None
    #
    # bot_token_ref: str | None

    # a list of responders to allow to respond to this message
    # other messages will be ignored
    # allowed_responder_ids: list[str] | None


class WhatsAppContactChannel(BaseModel):
    """
    Router for contacting a user or group via WhatsApp
    """

    # the phone number to contact

    user_phone_number: str

    # target context for the LLM, e.g. target_context="a dm with the director of engineering"
    # will update the tool description to
    # "contact a human in whatsapp in a dm with the director of engineering"
    #
    # other examples e.g. "a dm with the user you're assisting"
    context_about_channel_or_user: str | None = None

    # a twilio token to override the default contact channel
    # if you use a custom twilio token, ensure your app's
    # twilio webhook destination is set appropriately so your humanlayer server can receive events
    twilio_token: str | None = None


class ContactChannel(BaseModel):
    slack: SlackContactChannel | None = None
    whatsapp: WhatsAppContactChannel | None = None

    def model_post_init(self, __context: Any) -> None:
        if sum(1 for channel in [self.slack, self.whatsapp] if channel) != 1:
            raise ValueError("Contact channel requires exactly one channel")


class FunctionCallSpec(BaseModel):
    fn: str
    kwargs: dict
    channel: ContactChannel | None = None


class FunctionCall(BaseModel):
    run_id: str
    call_id: str
    spec: FunctionCallSpec
    status: FunctionCallStatus | None = None


class HumanContactSpec(BaseModel):
    msg: str
    channel: ContactChannel | None = None


class HumanContactStatus(BaseModel):
    response: str


class HumanContact(BaseModel):
    run_id: str
    call_id: str
    spec: HumanContactSpec
    status: HumanContactStatus | None = None
