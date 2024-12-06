from datetime import datetime
from typing import Any

import langchain_core.tools as langchain_tools
from dotenv import load_dotenv
from langchain.agents import AgentType, initialize_agent
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from channels import (
    dm_with_ceo,
)
from humanlayer import ResponseOption
from humanlayer.core.approval import (
    HumanLayer,
)

load_dotenv()

hl = HumanLayer(
    verbose=True,
    # run_id is optional -it can be used to identify the agent in approval history
    run_id="langchain-classification",
)

task_prompt = """

Examine the data and determine the best classification
based on the facts. Then confirm the classification using a tool

"""


class DR(BaseModel):
    fact_id: str
    fact: str


class DRS(BaseModel):
    data_rows: list[DR]


def get_data_rows() -> DRS:
    """get the data rows"""
    return DRS(
        data_rows=[
            DR(
                fact_id="123",
                fact="round and about 2 inches thick",
            ),
            DR(
                fact_id="124",
                fact="Bright red in color",
            ),
            DR(
                fact_id="125",
                fact="sweet flavor",
            ),
        ],
    )


@hl.require_approval(
    contact_channel=dm_with_ceo,
    reject_options=[
        ResponseOption(
            name="apple",
            description="It's an Apple",
            prompt_fill="",
        ),
        ResponseOption(
            name="orange",
            title="It's an Orange",  # optional - add a title
            description="It's an Orange",
            prompt_fill="",
        ),
        ResponseOption(
            name="banana",
            description="It's a Banana",
            prompt_fill="",
        ),
    ],
)
def confirm_classification(data_rows: Any, proposed_classification: str) -> str:
    """confirm the classification of a thread"""
    return f"thread {data_rows} classified as {proposed_classification}"


tools = [
    langchain_tools.StructuredTool.from_function(get_data_rows),
    langchain_tools.StructuredTool.from_function(confirm_classification),
    langchain_tools.StructuredTool.from_function(
        # allow the agent to contact the CEO
        hl.human_as_tool(
            contact_channel=dm_with_ceo,
            response_options=None,
        ),
    ),
]

llm = ChatOpenAI(model="gpt-4o", temperature=0)
agent = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.OPENAI_FUNCTIONS,
    verbose=True,
    handle_parsing_errors=True,
)

if __name__ == "__main__":
    result = agent.run(task_prompt)
    print("\n\n----------Result----------\n\n")
    print(result)
