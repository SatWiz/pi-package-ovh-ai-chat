#!/bin/bash
#
# Quick OVH AI Endpoints Smoke Test
# Run with: npm run test:quick
#

set -e

echo "🧪 OVH AI Endpoints Quick Test"
echo "================================"
echo ""

# NOTE: models must support the OpenAI Responses API (provider default).
# OVH's Mistral models only serve /v1/chat/completions (404 on /v1/responses).
MODELS=(
  "ovhai/gpt-oss-20b"
  "ovhai/gpt-oss-120b"
  "ovhai/Qwen3.6-27B"
)

PASSED=0
FAILED=0

for MODEL in "${MODELS[@]}"; do
  echo -n "Testing $MODEL... "
  
  if timeout 30 pi -ne -e . --no-session --model "$MODEL" -p "Say 'TEST_OK'" 2>&1 | grep -q "TEST_OK"; then
    echo "✅ PASS"
    PASSED=$((PASSED + 1))
  else
    echo "❌ FAIL"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Results: $PASSED passed, $FAILED failed"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
