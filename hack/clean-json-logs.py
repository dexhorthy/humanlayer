#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Clean JSON log files by truncating long fields for readability.
"""

import json
import sys
import os
from pathlib import Path

MAX_STRING_LENGTH = 200  # Truncate strings longer than this

def truncate_value(value, path=""):
    """Recursively truncate long string values in JSON structure."""
    
    if isinstance(value, str):
        if len(value) > MAX_STRING_LENGTH:
            return value[:MAX_STRING_LENGTH] + f"...[TRUNCATED {len(value)-MAX_STRING_LENGTH} chars]"
        return value
    
    elif isinstance(value, dict):
        result = {}
        for k, v in value.items():
            new_path = f"{path}.{k}" if path else k
            result[k] = truncate_value(v, new_path)
        return result
    
    elif isinstance(value, list):
        # Process all items, don't truncate lists
        return [truncate_value(item, f"{path}[{i}]") for i, item in enumerate(value)]
    
    else:
        # Numbers, booleans, None, etc.
        return value

def clean_json_file(filepath):
    """Read and clean a single JSON file."""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        # Truncate the data
        cleaned = truncate_value(data)
        
        # Pretty print
        print(f"\n{'='*80}")
        print(f"FILE: {filepath}")
        print('='*80)
        print(json.dumps(cleaned, indent=2))
        
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def main():
    if len(sys.argv) < 2:
        # If no args, process all JSON files in claude-api-logs/
        log_dir = Path("claude-api-logs")
        if log_dir.exists():
            files = sorted(log_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
            if files:
                print(f"Found {len(files)} log files. Showing most recent:")
                clean_json_file(files[0])
                
                if len(files) > 1:
                    print(f"\n\nOther files available:")
                    for f in files[1:6]:  # Show up to 5 more
                        print(f"  {f}")
                    if len(files) > 6:
                        print(f"  ... and {len(files)-6} more")
            else:
                print("No log files found in claude-api-logs/")
        else:
            print("Directory claude-api-logs/ not found")
            print("\nUsage:")
            print("  python clean-json-logs.py                    # Process most recent log")
            print("  python clean-json-logs.py <file.json>        # Process specific file")
            print("  python clean-json-logs.py claude-api-logs/* # Process all files")
    else:
        # Process specified files
        for arg in sys.argv[1:]:
            for filepath in Path(".").glob(arg):
                if filepath.suffix == '.json':
                    clean_json_file(filepath)

if __name__ == "__main__":
    main()