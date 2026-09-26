"""Fake claude CLI that reproduces a signed-out host: auth banner on stderr, non-zero exit."""
import sys

print("Not logged in · Please run /login", file=sys.stderr, flush=True)
sys.exit(1)
