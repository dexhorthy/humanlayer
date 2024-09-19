from datetime import datetime
from unittest.mock import Mock

import pytest

from humanlayer import (
    AgentBackend,
    ContactChannel,
    FunctionCall,
    FunctionCallSpec,
    HumanLayer,
    SlackContactChannel,
)
from humanlayer.core.models import FunctionCallStatus
from humanlayer.core.protocol import AgentStore, HumanLayerException, UserDeniedError


def test_require_approval() -> None:
    mock_backend = Mock(spec=AgentBackend)
    functions = Mock(spec=AgentStore[FunctionCall])
    mock_backend.functions.return_value = functions

    functions.add.return_value = None

    mock_function = Mock()
    mock_function.__name__ = "_fn_"
    mock_function.return_value = "bosh"

    hl = HumanLayer(
        backend=mock_backend,
        genid=lambda x: "generated-id",
    )

    wrapped = hl.require_approval().wrap(mock_function)

    ret = wrapped(bar="baz")
    assert ret == "bosh"

    functions.add.assert_called_once_with(
        FunctionCall(
            run_id="generated-id",
            call_id="generated-id",
            spec=FunctionCallSpec(fn="_fn_", kwargs={"bar": "baz"}, channel=None),
        )
    )
    functions.get.assert_called_once_with("generated-id")
    mock_function.assert_called_with(bar="baz")


def test_require_approval_instance_contact_channel() -> None:
    """
    test setting contact channel on the instance
    """
    mock_backend = Mock(spec=AgentBackend)
    functions = Mock(spec=AgentStore[FunctionCall])
    mock_backend.functions.return_value = functions

    functions.add.return_value = None

    mock_function = Mock()
    mock_function.__name__ = "_fn_"
    mock_function.return_value = "bosh"

    contact_channel = ContactChannel(
        slack=SlackContactChannel(
            channel_or_user_id="U8675309",
            context_about_channel_or_user="a dm with the librarian",
        )
    )

    hl = HumanLayer(
        backend=mock_backend,
        genid=lambda x: "generated-id",
        contact_channel=contact_channel,
    )

    wrapped = hl.require_approval().wrap(mock_function)

    ret = wrapped(bar="baz")
    assert ret == "bosh"

    functions.add.assert_called_once_with(
        FunctionCall(
            run_id="generated-id",
            call_id="generated-id",
            spec=FunctionCallSpec(
                fn="_fn_",
                kwargs={"bar": "baz"},
                channel=contact_channel,
            ),
        )
    )
    functions.get.assert_called_once_with("generated-id")
    mock_function.assert_called_with(bar="baz")


def test_require_approval_wrapper_contact_channel() -> None:
    """
    test setting contact channel on the decorator/wrapper
    """
    mock_backend = Mock(spec=AgentBackend)
    functions = Mock(spec=AgentStore[FunctionCall])
    mock_backend.functions.return_value = functions

    functions.add.return_value = None

    mock_function = Mock()
    mock_function.__name__ = "_fn_"
    mock_function.return_value = "bosh"

    contact_channel = ContactChannel(
        slack=SlackContactChannel(
            channel_or_user_id="U8675309",
            context_about_channel_or_user="a dm with the librarian",
        )
    )

    hl = HumanLayer(backend=mock_backend, genid=lambda x: "generated-id", sleep=lambda x: None)

    wrapped = hl.require_approval(contact_channel).wrap(mock_function)

    ret = wrapped(bar="baz")
    assert ret == "bosh"

    functions.add.assert_called_once_with(
        FunctionCall(
            run_id="generated-id",
            call_id="generated-id",
            spec=FunctionCallSpec(
                fn="_fn_",
                kwargs={"bar": "baz"},
                channel=contact_channel,
            ),
        )
    )
    functions.get.assert_called_once_with("generated-id")
    mock_function.assert_called_with(bar="baz")

def test_require_approval_reject_raise() -> None:
    mock_backend = Mock(spec=AgentBackend)
    functions = Mock(spec=AgentStore[FunctionCall])
    mock_backend.functions.return_value = functions

    functions.add.return_value = None

    functions.get.return_value = FunctionCall(
        run_id="generated-id",
        call_id="generated-id",
        spec=FunctionCallSpec(
            fn="_fn_",
            kwargs={"bar": "baz"},
        ),
        status=FunctionCallStatus(
            requested_at=datetime.now(),
            approved=False,
            comment="plz no",
        ),
    )

    hl = HumanLayer(
        backend=mock_backend,
        genid=lambda x: "generated-id",
        sleep=lambda x: None,
        on_reject="raise",
    )

    mock_function = Mock()
    mock_function.__name__ = "_fn_"
    wrapped = hl.require_approval().wrap(mock_function)

    with pytest.raises(UserDeniedError) as exc_info:
        wrapped(bar="baz")

    assert str(exc_info.value) == "User denied _fn_ with message: plz no"

    functions.add.assert_called_once()
    functions.get.assert_called_once()
    mock_function.assert_not_called()

def test_require_approval_context_manager() -> None:
    mock_backend = Mock(spec=AgentBackend)
    functions = Mock(spec=AgentStore[FunctionCall])
    mock_backend.functions.return_value = functions

    functions.add.return_value = None

    mock_function = Mock()
    mock_function.__name__ = "_fn_"
    mock_function.return_value = "bosh"

    hl = HumanLayer(
        backend=mock_backend,
        genid=lambda x: "generated-id",
        sleep=lambda x: None,
    )

    with hl.require_approval() as rejected:
        if rejected is not None:

        ret = mock_function(bar="baz")

    assert ret == "bosh"

    functions.add.assert_called_once_with(
        FunctionCall(
            run_id="generated-id",
            call_id="generated-id",
            spec=FunctionCallSpec(fn="_fn_", kwargs={"bar": "baz"}, channel=None),
        )
    )
    functions.get.assert_called_once_with("generated-id")
    mock_function.assert_called_with(bar="baz")


def test_require_approval_instance_contact_channel() -> None:
    """
    test setting contact channel on the instance
    """
    mock_backend = Mock(spec=AgentBackend)
    functions = Mock(spec=AgentStore[FunctionCall])
    mock_backend.functions.return_value = functions

    functions.add.return_value = None

    mock_function = Mock()
    mock_function.__name__ = "_fn_"
    mock_function.return_value = "bosh"

    contact_channel = ContactChannel(
        slack=SlackContactChannel(
            channel_or_user_id="U8675309",
            context_about_channel_or_user="a dm with the librarian",
        )
    )

    hl = HumanLayer(
        backend=mock_backend,
        genid=lambda x: "generated-id",
        contact_channel=contact_channel,
    )

    wrapped = hl.require_approval().wrap(mock_function)

    ret = wrapped(bar="baz")
    assert ret == "bosh"

    functions.add.assert_called_once_with(
        FunctionCall(
            run_id="generated-id",
            call_id="generated-id",
            spec=FunctionCallSpec(
                fn="_fn_",
                kwargs={"bar": "baz"},
                channel=contact_channel,
            ),
        )
    )
    functions.get.assert_called_once_with("generated-id")
    mock_function.assert_called_with(bar="baz")


