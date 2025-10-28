while true; do
    cat PROMPT.md | claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --verbose \
        | npx repomirror visualize
    echo -n "\n\n========================LOOP=========================\n\n"
    sleep 10
done
