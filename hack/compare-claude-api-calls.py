#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Compare Claude API calls to understand differences between models.
"""

import json
import sys
from pathlib import Path

def extract_key_info(filepath):
    """Extract key information from a log file."""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        request = data.get('request', {})
        headers = request.get('headers', {})
        body = request.get('body_json', {})
        
        return {
            'file': filepath.name,
            'model': data.get('model', 'unknown'),
            'api_model': body.get('model', 'unknown'),
            'path': data.get('path', 'unknown'),
            'anthropic_version': headers.get('Anthropic-Version', 'not set'),
            'anthropic_beta': headers.get('Anthropic-Beta', 'not set'),
            'max_tokens': body.get('max_tokens', 'not set'),
            'temperature': body.get('temperature', 'not set'),
            'stream': body.get('stream', 'not set'),
            'tools_count': len(body.get('tools', [])),
            'messages_count': len(body.get('messages', [])),
            'has_system': 'system' in body,
        }
    except Exception as e:
        return {'file': filepath.name, 'error': str(e)}

def main():
    log_dir = Path("claude-api-logs")
    if not log_dir.exists():
        print("No claude-api-logs directory found")
        return
    
    files = sorted(log_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    if not files:
        print("No log files found")
        return
    
    print("CLAUDE API COMPARISON")
    print("=" * 80)
    
    # Extract info from all files
    all_info = []
    for f in files:
        info = extract_key_info(f)
        if 'error' not in info:
            all_info.append(info)
    
    # Group by model
    by_model = {}
    for info in all_info:
        model = info['api_model']
        if model not in by_model:
            by_model[model] = []
        by_model[model].append(info)
    
    # Show comparison
    print("\nMODELS FOUND:")
    for model in sorted(by_model.keys()):
        print(f"  - {model} ({len(by_model[model])} requests)")
    
    print("\n" + "-" * 80)
    print("KEY DIFFERENCES:")
    print("-" * 80)
    
    # Show first example of each model
    for model in sorted(by_model.keys()):
        info = by_model[model][0]  # First example
        print(f"\nModel: {model}")
        print(f"  File: {info['file']}")
        print(f"  Path: {info['path']}")
        print(f"  Anthropic-Version: {info['anthropic_version']}")
        print(f"  Max tokens: {info['max_tokens']}")
        print(f"  Temperature: {info['temperature']}")
        print(f"  Stream: {info['stream']}")
        print(f"  Tools count: {info['tools_count']}")
        
    # Show API betas
    print("\n" + "-" * 80)
    print("ANTHROPIC BETA HEADERS:")
    print("-" * 80)
    unique_betas = set()
    for info in all_info:
        unique_betas.add(info['anthropic_beta'])
    for beta in sorted(unique_betas):
        print(f"\n{beta}")
        
    print("\n" + "=" * 80)
    print("SUMMARY:")
    print("=" * 80)
    print("\nTo route requests:")
    print("1. Check request.body_json.model field")
    print("2. Route opus models to local inference")
    print("3. Route sonnet/haiku to Anthropic")
    print("\nModel strings seen:")
    for model in sorted(by_model.keys()):
        print(f"  - {model}")

if __name__ == "__main__":
    main()