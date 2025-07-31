#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.11"
# dependencies = ["flask", "requests", "sseclient-py"]
# ///
"""
Proxy that transforms Anthropic API calls to OpenAI format.
Routes all calls to localhost:9900/v1 with proper format conversion.
"""

import json
import logging
import sys
from flask import Flask, request, Response, stream_with_context
import requests
from datetime import datetime
import uuid
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
OPENAI_API_URL = "http://localhost:9900/v1"
PROXY_PORT = 9902
API_KEY = "sk_boomer"  # From crush.json

# Model mapping from Anthropic to OpenAI-compatible names
MODEL_MAPPING = {
    "claude-opus-4-20250514": "qwen3",  # Map all models to qwen3
    "claude-sonnet-4-20250514": "qwen3",  
    "claude-3-5-haiku-20241022": "qwen3",
}

def transform_anthropic_to_openai(anthropic_body):
    """Transform Anthropic request format to OpenAI format."""
    # Log incoming request details
    logger.info(f"=== ANTHROPIC REQUEST ===")
    logger.info(f"Model: {anthropic_body.get('model')}")
    logger.info(f"Max tokens: {anthropic_body.get('max_tokens')}")
    logger.info(f"Temperature: {anthropic_body.get('temperature')}")
    logger.info(f"Stream: {anthropic_body.get('stream')}")
    logger.info(f"Has tools: {'tools' in anthropic_body}")
    if 'tools' in anthropic_body:
        logger.info(f"Tools count: {len(anthropic_body['tools'])}")
    logger.info(f"Messages count: {len(anthropic_body.get('messages', []))}")
    
    openai_body = {
        "model": MODEL_MAPPING.get(anthropic_body.get("model"), anthropic_body.get("model")),
        "messages": [],
        "max_tokens": anthropic_body.get("max_tokens", 4096),
        "temperature": anthropic_body.get("temperature", 1.0),
        "stream": anthropic_body.get("stream", False),
    }
    
    # Convert system messages
    if "system" in anthropic_body:
        logger.info(f"System messages: {len(anthropic_body['system'])}")
        for i, sys_msg in enumerate(anthropic_body["system"]):
            if isinstance(sys_msg, dict) and sys_msg.get("type") == "text":
                content = sys_msg["text"][:200] + "..." if len(sys_msg["text"]) > 200 else sys_msg["text"]
                logger.info(f"System[{i}]: {content}")
                openai_body["messages"].append({
                    "role": "system",
                    "content": sys_msg["text"]
                })
    
    # Convert regular messages
    for i, msg in enumerate(anthropic_body.get("messages", [])):
        logger.info(f"Message[{i}] role: {msg['role']}")
        if msg["role"] == "user":
            # Handle content that might be string or array
            content = msg["content"]
            if isinstance(content, list):
                logger.info(f"  User message has {len(content)} parts")
                # Extract text content from array
                text_parts = []
                for j, part in enumerate(content):
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_preview = part["text"][:100] + "..." if len(part["text"]) > 100 else part["text"]
                        logger.info(f"  Part[{j}]: {text_preview}")
                        text_parts.append(part["text"])
                content = "\n".join(text_parts)
            else:
                logger.info(f"  Content: {content[:100]}...")
            
            openai_body["messages"].append({
                "role": "user",
                "content": content
            })
        elif msg["role"] == "assistant":
            content = msg.get("content", "")
            if isinstance(content, list):
                # Extract text content
                text_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_parts.append(part["text"])
                    elif isinstance(part, dict) and part.get("type") == "tool_use":
                        logger.info(f"  Assistant used tool: {part.get('name')}")
                content = "\n".join(text_parts)
            
            openai_body["messages"].append({
                "role": "assistant",
                "content": content
            })
    
    logger.info(f"=== OPENAI REQUEST ===")
    logger.info(f"Model: {openai_body['model']}")
    logger.info(f"Messages: {len(openai_body['messages'])}")
    for i, msg in enumerate(openai_body['messages']):
        content_preview = msg['content'][:100] + "..." if len(msg['content']) > 100 else msg['content']
        logger.info(f"  [{i}] {msg['role']}: {content_preview}")
    
    return openai_body

def transform_openai_to_anthropic_streaming(openai_stream, request_id):
    """Transform OpenAI streaming response to Anthropic format."""
    # Send initial message_start event
    yield f'event: message_start\ndata: {json.dumps({
        "type": "message_start",
        "message": {
            "id": request_id,
            "type": "message",
            "role": "assistant",
            "model": "claude-3-5-haiku-20241022",  # Use the original model
            "content": [],
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {
                "input_tokens": 100,  # Placeholder
                "output_tokens": 1,
                "service_tier": "standard"
            }
        }
    })}\n\n'
    
    # Send content_block_start
    yield f'event: content_block_start\ndata: {json.dumps({
        "type": "content_block_start",
        "index": 0,
        "content_block": {"type": "text", "text": ""}
    })}\n\n'
    
    # Process OpenAI stream
    for line in openai_stream.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data_str = line[6:]
                if data_str == '[DONE]':
                    # Send final events
                    yield f'event: content_block_stop\ndata: {json.dumps({"type": "content_block_stop", "index": 0})}\n\n'
                    yield f'event: message_delta\ndata: {json.dumps({
                        "type": "message_delta",
                        "delta": {"stop_reason": "end_turn"},
                        "usage": {"output_tokens": 100}  # Placeholder
                    })}\n\n'
                    yield f'event: message_stop\ndata: {json.dumps({"type": "message_stop"})}\n\n'
                    break
                
                try:
                    data = json.loads(data_str)
                    # Extract content from OpenAI format
                    if 'choices' in data and len(data['choices']) > 0:
                        delta = data['choices'][0].get('delta', {})
                        if 'content' in delta:
                            # Send as Anthropic content_block_delta
                            yield f'event: content_block_delta\ndata: {json.dumps({
                                "type": "content_block_delta",
                                "index": 0,
                                "delta": {"type": "text_delta", "text": delta['content']}
                            })}\n\n'
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse OpenAI response: {data_str}")

def transform_openai_to_anthropic(openai_response):
    """Transform OpenAI response to Anthropic format."""
    openai_data = openai_response.json()
    
    # Extract content from OpenAI format
    content = ""
    if 'choices' in openai_data and len(openai_data['choices']) > 0:
        content = openai_data['choices'][0]['message']['content']
    
    anthropic_response = {
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "role": "assistant",
        "model": "claude-3-5-haiku-20241022",  # Use original model
        "content": [{"type": "text", "text": content}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": openai_data.get('usage', {}).get('prompt_tokens', 100),
            "output_tokens": openai_data.get('usage', {}).get('completion_tokens', 100),
            "service_tier": "standard"
        }
    }
    
    return anthropic_response

@app.route('/v1/messages', methods=['POST'])
def proxy_messages():
    """Proxy Anthropic messages API to OpenAI format."""
    try:
        # Get Anthropic request
        anthropic_body = request.get_json()
        
        # Log incoming request
        logger.info(f"Incoming Anthropic request - Model: {anthropic_body.get('model')}")
        
        # Transform to OpenAI format
        openai_body = transform_anthropic_to_openai(anthropic_body)
        
        # Prepare headers for OpenAI
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_KEY}'  # Use the configured API key
        }
        
        # Make request to OpenAI-compatible endpoint
        openai_url = f"{OPENAI_API_URL}/chat/completions"
        logger.info(f"Sending to OpenAI endpoint: {openai_url}")
        
        if anthropic_body.get("stream", False):
            # Handle streaming
            logger.info("Handling streaming request")
            response = requests.post(
                openai_url,
                json=openai_body,
                headers=headers,
                stream=True,
                timeout=60
            )
            logger.info(f"OpenAI streaming response status: {response.status_code}")
            
            request_id = f"msg_{uuid.uuid4().hex[:24]}"
            
            return Response(
                stream_with_context(transform_openai_to_anthropic_streaming(response, request_id)),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'X-Request-Id': request_id
                }
            )
        else:
            # Handle non-streaming
            logger.info("Handling non-streaming request")
            response = requests.post(
                openai_url,
                json=openai_body,
                headers=headers,
                timeout=30
            )
            logger.info(f"OpenAI response status: {response.status_code}")
            
            if response.status_code == 200:
                # Transform response
                openai_response_data = response.json()
                logger.info(f"OpenAI response: {json.dumps(openai_response_data, indent=2)[:500]}...")
                anthropic_response = transform_openai_to_anthropic(response)
                return Response(
                    json.dumps(anthropic_response),
                    mimetype='application/json',
                    status=200
                )
            else:
                # Return error
                logger.error(f"OpenAI error: {response.content.decode()[:500]}...")
                return Response(
                    response.content,
                    status=response.status_code,
                    mimetype='application/json'
                )
                
    except Exception as e:
        logger.error(f"Error in proxy: {str(e)}", exc_info=True)
        return Response(
            json.dumps({"error": str(e)}),
            status=500,
            mimetype='application/json'
        )

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return Response(
        json.dumps({
            "status": "healthy",
            "openai_url": OPENAI_API_URL,
            "models": list(MODEL_MAPPING.keys())
        }),
        mimetype='application/json'
    )

# Catch-all route for other paths
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    """Log any other API calls."""
    logger.warning(f"Unhandled path: {request.method} /{path}")
    return Response(
        json.dumps({"error": f"Path /{path} not implemented"}),
        status=404,
        mimetype='application/json'
    )

if __name__ == '__main__':
    logger.info(f"Starting Claude → OpenAI proxy on port {PROXY_PORT}")
    logger.info(f"Routing to: {OPENAI_API_URL}")
    logger.info(f"Model mappings: {MODEL_MAPPING}")
    logger.info("")
    logger.info("Test with:")
    logger.info(f"  ANTHROPIC_BASE_URL=http://localhost:{PROXY_PORT} claude -p 'Hello'")
    
    app.run(host='0.0.0.0', port=PROXY_PORT, debug=False)