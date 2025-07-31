#!/usr/bin/env python3
"""
Compare API calls between different Claude models to understand routing logic.

This script analyzes the captured logs and shows exact differences between models.
"""

import json
import os
import sys
from collections import defaultdict
from datetime import datetime

LOG_DIR = "claude-api-logs"

def load_all_logs():
    """Load all log files and group by model."""
    logs_by_model = defaultdict(list)
    
    if not os.path.exists(LOG_DIR):
        print(f"Log directory {LOG_DIR} not found. Run some tests first.")
        return logs_by_model
    
    for filename in os.listdir(LOG_DIR):
        if filename.endswith('.json'):
            filepath = os.path.join(LOG_DIR, filename)
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    model = data.get('model', 'unknown')
                    logs_by_model[model].append(data)
            except Exception as e:
                print(f"Error loading {filename}: {e}")
    
    return logs_by_model

def extract_key_fields(log_data):
    """Extract key fields for comparison."""
    request = log_data.get('request', {})
    response = log_data.get('response', {})
    headers = request.get('headers', {})
    body = request.get('body_json', {})
    
    return {
        'model': log_data.get('model'),
        'path': log_data.get('path'),
        'method': log_data.get('method'),
        'anthropic_version': headers.get('anthropic-version'),
        'anthropic_beta': headers.get('anthropic-beta'),
        'model_in_body': body.get('model'),
        'max_tokens': body.get('max_tokens'),
        'temperature': body.get('temperature'),
        'stream': body.get('stream'),
        'has_system': 'system' in body,
        'message_count': len(body.get('messages', [])),
        'status_code': response.get('status_code'),
        'is_streaming': response.get('streaming', False)
    }

def compare_models():
    """Compare different models and show differences."""
    logs_by_model = load_all_logs()
    
    if not logs_by_model:
        print("No logs found. Run ./hack/claude-learn-api.sh first!")
        return
    
    print("=" * 80)
    print("CLAUDE MODEL COMPARISON")
    print("=" * 80)
    print()
    
    # Extract key fields for each model
    model_patterns = {}
    for model, logs in logs_by_model.items():
        if logs:
            # Use the most recent log for each model
            latest = sorted(logs, key=lambda x: x.get('timestamp', ''))[-1]
            model_patterns[model] = extract_key_fields(latest)
    
    # Show each model's pattern
    print("INDIVIDUAL MODEL PATTERNS:")
    print("-" * 80)
    
    for model, pattern in sorted(model_patterns.items()):
        print(f"\nModel: {model}")
        print(f"  API model string: {pattern['model_in_body']}")
        print(f"  Path: {pattern['path']}")
        print(f"  Anthropic version: {pattern['anthropic_version']}")
        print(f"  Default max_tokens: {pattern['max_tokens']}")
        print(f"  Streaming: {pattern['is_streaming']}")
    
    # Find differences between models
    print("\n" + "=" * 80)
    print("KEY DIFFERENCES:")
    print("-" * 80)
    
    if len(model_patterns) < 2:
        print("Need at least 2 different models to compare. Run more tests!")
        return
    
    # Get all unique fields and values
    all_fields = set()
    for pattern in model_patterns.values():
        all_fields.update(pattern.keys())
    
    # Find fields that differ between models
    different_fields = []
    for field in sorted(all_fields):
        values = set()
        for pattern in model_patterns.values():
            values.add(str(pattern.get(field)))
        if len(values) > 1:
            different_fields.append(field)
    
    if not different_fields:
        print("No differences found in API calls between models!")
    else:
        print("\nFields that differ between models:")
        for field in different_fields:
            print(f"\n{field}:")
            for model, pattern in sorted(model_patterns.items()):
                print(f"  {model}: {pattern.get(field)}")
    
    # Show routing logic
    print("\n" + "=" * 80)
    print("ROUTING LOGIC (for proxy implementation):")
    print("-" * 80)
    
    print("\nBased on captured data, routing should be based on:")
    print("1. The 'model' field in the request body JSON")
    print("2. Models to route locally:")
    
    # Identify which models might be routed locally
    local_models = []
    for model in model_patterns:
        if 'opus' in model.lower() or 'claude-opus' in model:
            local_models.append(model)
    
    if local_models:
        for model in local_models:
            print(f"   - {model}")
    else:
        print("   - No opus models detected yet")
    
    print("\n3. All other models should route to Anthropic API")
    
    # Show exact JSON to match
    print("\n" + "=" * 80)
    print("EXACT JSON PATTERNS:")
    print("-" * 80)
    
    for model, logs in logs_by_model.items():
        if logs:
            latest = sorted(logs, key=lambda x: x.get('timestamp', ''))[-1]
            request_body = latest.get('request', {}).get('body_json', {})
            
            print(f"\n{model} request body:")
            print(json.dumps(request_body, indent=2)[:500])  # Limit output
            if len(json.dumps(request_body)) > 500:
                print("... (truncated)")

def generate_routing_config():
    """Generate routing configuration based on captured data."""
    logs_by_model = load_all_logs()
    
    print("\n" + "=" * 80)
    print("SUGGESTED ROUTING CONFIGURATION:")
    print("-" * 80)
    
    all_models = set()
    for model, logs in logs_by_model.items():
        all_models.add(model)
        for log in logs:
            body_model = log.get('request', {}).get('body_json', {}).get('model')
            if body_model:
                all_models.add(body_model)
    
    print("\n# Models detected in API calls:")
    print("LOCAL_MODELS = {")
    for model in sorted(all_models):
        if 'opus' in model.lower():
            print(f'    "{model}",')
    print("}")
    
    print("\n# Models that should go to Anthropic:")
    print("ANTHROPIC_MODELS = {")
    for model in sorted(all_models):
        if 'opus' not in model.lower():
            print(f'    "{model}",')
    print("}")

if __name__ == '__main__':
    print("Claude API Model Comparison Tool")
    print()
    
    compare_models()
    generate_routing_config()
    
    print("\n" + "=" * 80)
    print("To capture more data, run:")
    print("  ./hack/claude-learn-api.sh")
    print("\nTo see all logs:")
    print("  python hack/claude-api-logger.py --analyze")