/**
 * Automated Test Suite for Smart Calculator Engine
 */

function testCalculator(expressionStr) {
    let fullExpr = expressionStr;

    // 1. Convert symbols
    let sanitized = fullExpr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/%/g, '/100');

    // 2. Implicit multiplication fixes
    sanitized = sanitized
        .replace(/(\d)\s*\(/g, '$1*(')
        .replace(/\)\s*(\d)/g, ')*$1')
        .replace(/\)\s*\(/g, ')*(')
        .replace(/(\/100)\s*(\d)/g, '$1*$2')
        .replace(/(\/100)\s*\(/g, '$1*(');

    // 3. Remove trailing dangling operators
    sanitized = sanitized.replace(/[\+\-\*\/]\s*$/, '');

    // 4. Auto close unclosed parentheses
    const openCount = (sanitized.match(/\(/g) || []).length;
    const closeCount = (sanitized.match(/\)/g) || []).length;
    if (openCount > closeCount) {
        sanitized += ')'.repeat(openCount - closeCount);
    }

    try {
        const evaluatedResult = new Function(`'use strict'; return (${sanitized})`)();

        if (!isFinite(evaluatedResult) || isNaN(evaluatedResult)) {
            return 'DivisionByZeroOrInvalid';
        }

        const resultRounded = Math.round(evaluatedResult * 100000000) / 100000000;
        return resultRounded;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// Comprehensive Test Cases
const testCases = [
    { input: '2 × ( 5 - 3 )', expected: 4 },
    { input: '2 ( 5 - 3 )', expected: 4 },
    { input: '2 × ( 5 - 3', expected: 4 }, // Unclosed parenthesis
    { input: '10 + 20 × 3', expected: 70 }, // Priority test
    { input: '( 10 + 20 ) × 3', expected: 90 },
    { input: '0.1 + 0.2', expected: 0.3 }, // Floating point precision
    { input: '50 %', expected: 0.5 }, // Percentage
    { input: '200 × 10 %', expected: 20 }, // Percentage multiplication
    { input: '-5 + 12', expected: 7 }, // Negative number
    { input: '5 × -3', expected: -15 }, // Negative factor
    { input: '100 ÷ 4', expected: 25 },
    { input: '5 ÷ 0', expected: 'DivisionByZeroOrInvalid' }, // Division by zero
    { input: '( 2 + 3 ) × ( 4 + 1 )', expected: 25 }, // Multiple parentheses
    { input: '99 + 00', expected: 99 },
    { input: '1000000 × 1000000', expected: 1000000000000 }, // Large number
    { input: '3.5 × 2.5', expected: 8.75 }
];

console.log('=== CALC ENGINE AUTOMATED TEST RUN ===\n');
let passed = 0;
testCases.forEach((tc, idx) => {
    const res = testCalculator(tc.input);
    const isOk = res === tc.expected;
    if (isOk) passed++;
    console.log(`Test #${idx + 1}: [${tc.input}] => Result: ${res} | Expected: ${tc.expected} -> ${isOk ? 'PASSED ✅' : 'FAILED ❌'}`);
});

console.log(`\nTEST SUMMARY: ${passed} / ${testCases.length} PASSED.`);
