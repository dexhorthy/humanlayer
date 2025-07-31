#!/usr/bin/env python3
"""
Simple logging proxy server for debugging Claude CLI requests.

Usage:
    1. Install dependencies: pip install flask requests
    2. Run the proxy: python hack/test-claude-proxy.py
    3. Test with Claude CLI:
       ANTHROPIC_BASE_URL=http://localhost:9901 timeout 10 claude -p
"""

import json
import logging
import sys
from datetime import datetime
from flask import Flask, request, Response
import requests
from urllib.parse import urljoin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('claude-proxy.log')
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
ANTHROPIC_API_URL = "https://api.anthropic.com"
LOCAL_API_URL = "http://localhost:9900"
PROXY_PORT = 9901

# Models that should be routed to local API
LOCAL_MODELS = {
    "claude-opus-4-20250514",
    "opus-4",
    "claude-opus-4",
    # Add other local models here
}

def log_request_details(path, headers, body):
    """Log detailed request information."""
    logger.info("="*80)
    logger.info(f"REQUEST: {request.method} {path}")
    logger.info(f"Full URL: {request.url}")
    logger.info(f"Remote Address: {request.remote_addr}")
    
    # Log headers (excluding sensitive ones)
    logger.info("Headers:")
    for key, value in headers.items():
        if key.lower() in ['x-api-key', 'authorization']:
            logger.info(f"  {key}: [REDACTED]")
        else:
            logger.info(f"  {key}: {value}")
    
    # Log body
    if body:
        try:
            parsed_body = json.loads(body)
            logger.info(f"Body (JSON):")
            logger.info(json.dumps(parsed_body, indent=2))
            
            # Extract and highlight model if present
            if 'model' in parsed_body:
                logger.info(f"*** MODEL: {parsed_body['model']} ***")
                
        except json.JSONDecodeError:
            logger.info(f"Body (Raw): {body}")
    else:
        logger.info("Body: <empty>")
    
    logger.info("="*80)

def determine_target_url(path, body):
    """Determine whether to route to Anthropic or local API based on model."""
    target_base = ANTHROPIC_API_URL
    
    if body:
        try:
            parsed_body = json.loads(body)
            model = parsed_body.get('model', '')
            
            # Check if model should be routed locally
            if model in LOCAL_MODELS or any(local_model in model for local_model in LOCAL_MODELS):
                target_base = LOCAL_API_URL
                logger.info(f"Routing to LOCAL API for model: {model}")
            else:
                logger.info(f"Routing to ANTHROPIC API for model: {model}")
                
        except json.JSONDecodeError:
            logger.warning("Could not parse body to determine model")
    
    return target_base

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
def proxy_request(path):
    """Proxy all requests to the appropriate backend."""
    try:
        # Get request details
        headers = dict(request.headers)
        body = request.get_data(as_text=True)
        
        # Log the incoming request
        log_request_details(path, headers, body)
        
        # Determine target URL
        target_base = determine_target_url(path, body)
        target_url = urljoin(target_base, path)
        
        # Remove headers that shouldn't be forwarded
        headers_to_forward = {}
        for key, value in headers.items():
            if key.lower() not in ['host', 'content-length']:
                headers_to_forward[key] = value
        
        logger.info(f"Forwarding to: {target_url}")
        
        # Make the request to the target
        response = requests.request(
            method=request.method,
            url=target_url,
            headers=headers_to_forward,
            data=body,
            params=request.args,
            stream=True,
            timeout=30
        )
        
        # Log response details
        logger.info(f"Response Status: {response.status_code}")
        logger.info(f"Response Headers: {dict(response.headers)}")
        
        # Create response
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = [(name, value) for (name, value) in response.raw.headers.items()
                   if name.lower() not in excluded_headers]
        
        # For streaming responses
        def generate():
            for chunk in response.iter_content(chunk_size=4096):
                if chunk:
                    # Log chunks for debugging (be careful with large responses)
                    if len(chunk) < 1000:
                        logger.debug(f"Chunk: {chunk}")
                    yield chunk
        
        return Response(generate(), response.status_code, headers)
        
    except Exception as e:
        logger.error(f"Error proxying request: {str(e)}", exc_info=True)
        return Response(
            json.dumps({"error": str(e)}),
            status=500,
            content_type='application/json'
        )

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return Response(
        json.dumps({
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "config": {
                "anthropic_url": ANTHROPIC_API_URL,
                "local_url": LOCAL_API_URL,
                "local_models": list(LOCAL_MODELS)
            }
        }),
        status=200,
        content_type='application/json'
    )

if __name__ == '__main__':
    logger.info(f"Starting Claude proxy server on port {PROXY_PORT}")
    logger.info(f"Anthropic API URL: {ANTHROPIC_API_URL}")
    logger.info(f"Local API URL: {LOCAL_API_URL}")
    logger.info(f"Local models: {LOCAL_MODELS}")
    logger.info("")
    logger.info("Test with:")
    logger.info(f"  ANTHROPIC_BASE_URL=http://localhost:{PROXY_PORT} timeout 10 claude -p")
    logger.info("")
    
    app.run(host='0.0.0.0', port=PROXY_PORT, debug=True)