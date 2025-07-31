#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.11"
# dependencies = ["flask", "requests"]
# ///
"""
Enhanced Claude API logging proxy for understanding exact API calls and payloads.

Features:
- Captures complete request/response pairs with timestamps
- Saves each interaction to a structured JSON file
- Detects model names and version strings
- Easy to analyze captured data

Usage:
    1. Run the proxy: python hack/claude-api-logger.py
    2. Run Claude with proxy: ANTHROPIC_BASE_URL=http://localhost:9902 claude -p "test"
    3. Analyze logs: python hack/claude-api-logger.py --analyze
"""

import json
import logging
import sys
import os
from datetime import datetime
from flask import Flask, request, Response
import requests
from urllib.parse import urljoin
import argparse
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
ANTHROPIC_API_URL = "https://api.anthropic.com"
LOCAL_API_URL = "http://localhost:9900"
PROXY_PORT = 9902
LOG_DIR = "claude-api-logs"

# Ensure log directory exists
os.makedirs(LOG_DIR, exist_ok=True)

def save_interaction(request_data, response_data):
    """Save a complete request/response interaction."""
    interaction_id = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()
    
    # Extract key information
    model = request_data.get('body_json', {}).get('model', 'unknown')
    method = request_data.get('method', 'unknown')
    path = request_data.get('path', 'unknown')
    
    interaction = {
        'id': interaction_id,
        'timestamp': timestamp,
        'model': model,
        'method': method,
        'path': path,
        'request': request_data,
        'response': response_data
    }
    
    # Save to file
    filename = f"{LOG_DIR}/{timestamp.replace(':', '-')}_{model}_{interaction_id[:8]}.json"
    with open(filename, 'w') as f:
        json.dump(interaction, f, indent=2)
    
    logger.info(f"Saved interaction to: {filename}")
    return interaction_id

def capture_request_details(path, headers, body):
    """Capture complete request details."""
    request_data = {
        'method': request.method,
        'path': path,
        'url': request.url,
        'headers': dict(headers),
        'body_raw': body,
        'timestamp': datetime.now().isoformat()
    }
    
    # Try to parse JSON body
    if body:
        try:
            request_data['body_json'] = json.loads(body)
        except json.JSONDecodeError:
            pass
    
    # Redact sensitive headers
    if 'x-api-key' in request_data['headers']:
        request_data['headers']['x-api-key'] = f"[REDACTED-{len(request_data['headers']['x-api-key'])}chars]"
    if 'authorization' in request_data['headers']:
        request_data['headers']['authorization'] = '[REDACTED]'
    
    return request_data

def capture_response_details(response, chunks=None):
    """Capture complete response details."""
    response_data = {
        'status_code': response.status_code,
        'headers': dict(response.headers),
        'timestamp': datetime.now().isoformat()
    }
    
    # For non-streaming responses
    if not chunks:
        try:
            response_data['body_json'] = response.json()
        except:
            response_data['body_raw'] = response.text[:1000]  # Limit size
    else:
        # For streaming responses, save chunks
        response_data['streaming'] = True
        response_data['chunks'] = chunks[:100]  # Limit number of chunks saved
    
    return response_data

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
def proxy_request(path):
    """Proxy and log all requests."""
    try:
        # Capture request
        headers = dict(request.headers)
        body = request.get_data(as_text=True)
        request_data = capture_request_details(path, headers, body)
        
        # Log key info
        model = request_data.get('body_json', {}).get('model', 'unknown')
        logger.info(f"REQUEST: {request.method} {path} | Model: {model}")
        
        # Always forward to Anthropic for logging purposes
        target_url = urljoin(ANTHROPIC_API_URL, path)
        
        # Prepare headers
        headers_to_forward = {}
        for key, value in headers.items():
            if key.lower() not in ['host', 'content-length']:
                headers_to_forward[key] = value
        
        # Make request
        response = requests.request(
            method=request.method,
            url=target_url,
            headers=headers_to_forward,
            data=body,
            params=request.args,
            stream=True,
            timeout=30
        )
        
        # Handle streaming vs non-streaming
        is_streaming = 'text/event-stream' in response.headers.get('content-type', '')
        
        if is_streaming:
            chunks = []
            def generate():
                for chunk in response.iter_content(chunk_size=4096):
                    if chunk:
                        chunks.append(chunk.decode('utf-8', errors='ignore'))
                        yield chunk
            
            # Create response
            excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
            headers = [(name, value) for (name, value) in response.raw.headers.items()
                       if name.lower() not in excluded_headers]
            
            response_obj = Response(generate(), response.status_code, headers)
            
            # Save after streaming completes
            @response_obj.call_on_close
            def save_on_close():
                response_data = capture_response_details(response, chunks)
                save_interaction(request_data, response_data)
            
            return response_obj
        else:
            # Non-streaming response
            response_data = capture_response_details(response)
            save_interaction(request_data, response_data)
            
            return Response(
                response.content,
                status=response.status_code,
                headers=dict(response.headers)
            )
            
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        error_response = {'error': str(e)}
        save_interaction(request_data, {'error': str(e), 'status_code': 500})
        return Response(
            json.dumps(error_response),
            status=500,
            content_type='application/json'
        )

def analyze_logs():
    """Analyze captured logs to understand API patterns."""
    print("\n=== Claude API Analysis ===\n")
    
    # Find all log files
    log_files = [f for f in os.listdir(LOG_DIR) if f.endswith('.json')]
    
    if not log_files:
        print("No log files found. Run some Claude commands with the proxy first.")
        return
    
    # Analyze each log
    models_seen = set()
    paths_seen = set()
    version_strings = set()
    
    for log_file in sorted(log_files):
        with open(os.path.join(LOG_DIR, log_file), 'r') as f:
            data = json.load(f)
        
        model = data.get('model', 'unknown')
        path = data.get('path', 'unknown')
        request = data.get('request', {})
        
        models_seen.add(model)
        paths_seen.add(path)
        
        # Extract version strings
        headers = request.get('headers', {})
        if 'anthropic-version' in headers:
            version_strings.add(headers['anthropic-version'])
        
        print(f"\n--- {log_file} ---")
        print(f"Timestamp: {data.get('timestamp')}")
        print(f"Model: {model}")
        print(f"Path: {path}")
        print(f"Method: {data.get('method')}")
        
        # Show request body structure
        if 'body_json' in request:
            body = request['body_json']
            print(f"\nRequest JSON keys: {list(body.keys())}")
            if 'model' in body:
                print(f"  model: {body['model']}")
            if 'messages' in body:
                print(f"  messages: {len(body['messages'])} message(s)")
            if 'max_tokens' in body:
                print(f"  max_tokens: {body['max_tokens']}")
            if 'system' in body:
                print(f"  system: {body['system'][:50]}..." if len(body['system']) > 50 else f"  system: {body['system']}")
        
        # Show response info
        response = data.get('response', {})
        print(f"\nResponse status: {response.get('status_code')}")
        if response.get('streaming'):
            print(f"Response type: Streaming ({len(response.get('chunks', []))} chunks)")
        elif 'body_json' in response:
            print(f"Response type: JSON")
    
    # Summary
    print("\n\n=== SUMMARY ===")
    print(f"\nModels seen: {sorted(models_seen)}")
    print(f"\nPaths used: {sorted(paths_seen)}")
    print(f"\nVersion strings: {sorted(version_strings)}")
    
    # Model-specific analysis
    print("\n\n=== MODEL-SPECIFIC PATTERNS ===")
    for model in sorted(models_seen):
        print(f"\n{model}:")
        model_logs = [f for f in log_files if model in f]
        for log_file in model_logs[:3]:  # Show first 3 examples
            with open(os.path.join(LOG_DIR, log_file), 'r') as f:
                data = json.load(f)
            request_body = data.get('request', {}).get('body_json', {})
            print(f"  - max_tokens: {request_body.get('max_tokens', 'not set')}")
            print(f"  - temperature: {request_body.get('temperature', 'not set')}")
            print(f"  - stream: {request_body.get('stream', 'not set')}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Claude API Logging Proxy')
    parser.add_argument('--analyze', action='store_true', help='Analyze captured logs')
    parser.add_argument('--clear', action='store_true', help='Clear all logs')
    args = parser.parse_args()
    
    if args.analyze:
        analyze_logs()
    elif args.clear:
        for f in os.listdir(LOG_DIR):
            if f.endswith('.json'):
                os.remove(os.path.join(LOG_DIR, f))
        print(f"Cleared all logs in {LOG_DIR}")
    else:
        print(f"Starting Claude API Logger on port {PROXY_PORT}")
        print(f"Logs will be saved to: {LOG_DIR}/")
        print("\nTest with:")
        print(f"  ANTHROPIC_BASE_URL=http://localhost:{PROXY_PORT} claude -p 'What is 2+2?'")
        print(f"  ANTHROPIC_BASE_URL=http://localhost:{PROXY_PORT} claude -m opus-4 -p 'What is 2+2?'")
        print(f"  ANTHROPIC_BASE_URL=http://localhost:{PROXY_PORT} claude -m claude-3-5-haiku-20241022 -p 'What is 2+2?'")
        print("\nAnalyze logs with:")
        print(f"  python {sys.argv[0]} --analyze")
        print("")
        
        app.run(host='0.0.0.0', port=PROXY_PORT, debug=False)