import pytest
from pydantic import ValidationError

from humanlayer import (
    ContactChannel,
    HumanLayerCloudConnection,
    SlackContactChannel,
    WhatsAppContactChannel,
)


def test_contact_channel_requires_exactly_one():
    with pytest.raises(ValidationError) as e:
        ContactChannel()

    assert "Contact channel requires exactly one channel" in str(e.value)


def test_contact_channel_slack_works():
    c = ContactChannel(slack=SlackContactChannel(channel_or_user_id="fake"))
    assert c is not None


def test_contact_channel_whatsapp_works():
    c = ContactChannel(whatsapp=WhatsAppContactChannel(user_phone_number="fake"))
    assert c is not None


def test_multi_contact_channel_fails():
    with pytest.raises(ValidationError) as e:
        ContactChannel(
            slack=SlackContactChannel(channel_or_user_id="fake"),
            whatsapp=WhatsAppContactChannel(user_phone_number="fake"),
        )

    assert "Contact channel requires exactly one channel" in str(e.value)


def test_cloud_connection():
    c = HumanLayerCloudConnection(api_key="key")
    assert c is not None
