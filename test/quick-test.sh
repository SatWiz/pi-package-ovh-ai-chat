#!/bin/bash
#
# Quick OVH AI Endpoints Smoke Test
# Run with: npm run test:quick
#

set -e

echo "🧪 OVH AI Endpoints Quick Test"
echo "================================"
echo ""

MODELS=(
  "ovhai/Mistral-7B-Instruct-v0.3"
  "ovhai/gpt-oss-20b"
  "ovhai/gpt-oss-120b"
)

PASSED=0
FAILED=0

for MODEL in "${MODELS[@]}"; do
  echo -n "Testing $MODEL... "
  
  if timeout 30 pi -ne -e . --no-session --model "$MODEL" -p "Say 'TEST_OK'" 2>&1 | grep -q "TEST_OK"; then
    echo "✅ PASS"
    ((PASSED++))
  else
    echo "❌ FAIL"
    ((FAILED++))
  fi
done

echo ""
echo "Results: $PASSED passed, $FAILED failed"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
