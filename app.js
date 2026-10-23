/**
 * Smart Bright Calculator & Real-Time FX Exchange Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // 1. STATE & CONSTANTS
    // ==========================================================================
    const state = {
        // Calculator state
        calcExpression: '',
        calcCurrentInput: '0',
        isEvaluated: false,
        history: JSON.parse(localStorage.getItem('smart_calc_history') || '[]'),

        // FX State
        baseCurrency: 'USD',
        rates: {
            USD: 1.0,
            KRW: 1385.50,
            JPY: 155.80,   // JPY per USD
            CNY: 7.26      // CNY per USD
        },
        txMode: 'cash-buy', // cash-buy, cash-sell, wire-send, wire-recv
        discountRate: 0.90, // 90% discount (0.0 to 1.0)
        sourceAmount: 1000,
        sourceCurr: 'KRW',
        targetCurr: 'USD',
        lastFxUpdated: null
    };

    // Standard Bank Spread Ratios (Estimate for Realistic Korean Banks like Shinhan/Kookmin)
    const FX_SPREADS = {
        'cash-buy': 0.0175,  // 현금 살 때 기준 스프레드 1.75%
        'cash-sell': 0.0175, // 현금 팔 때 기준 스프레드 1.75%
        'wire-send': 0.0100, // 송금 보낼 때 1.0%
        'wire-recv': 0.0100  // 송금 받을 때 1.0%
    };

    // Currency Meta (Symbols & Flags)
    const CURRENCY_META = {
        KRW: { symbol: '₩', name: '대한민국 원', flag: '🇰🇷', unit: 1 },
        USD: { symbol: '$', name: '미국 달러', flag: '🇺🇸', unit: 1 },
        JPY: { symbol: '¥', name: '일본 엔 (100엔)', flag: '🇯🇵', unit: 100 },
        CNY: { symbol: '¥', name: '중국 위안', flag: '🇨🇳', unit: 1 }
    };

    // ==========================================================================
    // 2. DOM ELEMENTS
    // ==========================================================================
    // Navigation & Views
    const tabCalc = document.getElementById('tab-calc');
    const tabFx = document.getElementById('tab-fx');
    const calcView = document.getElementById('calc-view');
    const fxView = document.getElementById('fx-view');
    const tabHistoryToggle = document.getElementById('tab-history-toggle');
    const historyDrawer = document.getElementById('history-drawer');
    const btnCloseHistory = document.getElementById('btn-close-history');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const historyList = document.getElementById('history-list');

    // Calculator Displays & Buttons
    const expressionDisplay = document.getElementById('expression-display');
    const resultDisplay = document.getElementById('result-display');
    const btnCopyCalc = document.getElementById('btn-copy-calc');
    const btnSendToFx = document.getElementById('btn-send-to-fx');
    const keypadGrid = document.querySelector('.keypad-grid');

    // FX Elements
    const fxUpdateTime = document.getElementById('fx-update-time');
    const btnRefreshFx = document.getElementById('btn-refresh-fx');
    const rateUsd = document.getElementById('rate-usd');
    const rateJpy = document.getElementById('rate-jpy');
    const rateCny = document.getElementById('rate-cny');
    const txModeBtns = document.querySelectorAll('.tx-mode-btn');
    const chipBtns = document.querySelectorAll('.chip-btn');
    const discountCurrentLabel = document.getElementById('discount-current-label');
    const fxSourceAmountInput = document.getElementById('fx-source-amount');
    const fxSourceCurrSelect = document.getElementById('fx-source-curr');
    const fxTargetCurrSelect = document.getElementById('fx-target-curr');
    const btnSwapCurr = document.getElementById('btn-swap-curr');
    const btnImportCalcResult = document.getElementById('btn-import-calc-result');
    const resTxBadge = document.getElementById('res-tx-badge');
    const fxFinalAmount = document.getElementById('fx-final-amount');
    const fxFinalSymbol = document.getElementById('fx-final-symbol');
    const fxExchangeDetailText = document.getElementById('fx-exchange-detail-text');
    const bdBaseRate = document.getElementById('bd-base-rate');
    const bdAppliedRate = document.getElementById('bd-applied-rate');
    const bdSavedFee = document.getElementById('bd-saved-fee');
    const toastContainer = document.getElementById('toast-container');

    // ==========================================================================
    // 3. INITIALIZATION
    // ==========================================================================
    function init() {
        bindEvents();
        updateCalcDisplay();
        fetchExchangeRates();
        renderHistory();
    }

    // ==========================================================================
    // 4. NAVIGATION & TAB EVENT HANDLERS
    // ==========================================================================
    function bindEvents() {
        // View Switcher
        tabCalc.addEventListener('click', () => switchTab('calc'));
        tabFx.addEventListener('click', () => switchTab('fx'));

        // History Drawer
        tabHistoryToggle.addEventListener('click', () => toggleDrawer(true));
        btnCloseHistory.addEventListener('click', () => toggleDrawer(false));
        historyDrawer.addEventListener('click', (e) => {
            if (e.target === historyDrawer) toggleDrawer(false);
        });
        btnClearHistory.addEventListener('click', clearHistory);

        // Calculator Actions
        keypadGrid.addEventListener('click', handleKeyClick);
        btnCopyCalc.addEventListener('click', copyCalcResult);
        btnSendToFx.addEventListener('click', sendCalcResultToFx);

        // Keyboard Support
        document.addEventListener('keydown', handleKeyboardInput);

        // FX Actions
        btnRefreshFx.addEventListener('click', fetchExchangeRates);
        txModeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                txModeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.txMode = btn.dataset.tx;
                calculateFX();
            });
        });

        chipBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                chipBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const discount = parseInt(btn.dataset.discount, 10);
                state.discountRate = discount / 100;
                discountCurrentLabel.textContent = `우대율 ${discount}%${discount === 90 ? ' (추천)' : ''}`;
                calculateFX();
            });
        });

        fxSourceAmountInput.addEventListener('input', (e) => {
            state.sourceAmount = parseFloat(e.target.value) || 0;
            calculateFX();
        });

        fxSourceCurrSelect.addEventListener('change', (e) => {
            state.sourceCurr = e.target.value;
            // Prevent same source & target currency
            if (state.sourceCurr === state.targetCurr) {
                state.targetCurr = state.sourceCurr === 'KRW' ? 'USD' : 'KRW';
                fxTargetCurrSelect.value = state.targetCurr;
            }
            calculateFX();
        });

        fxTargetCurrSelect.addEventListener('change', (e) => {
            state.targetCurr = e.target.value;
            if (state.targetCurr === state.sourceCurr) {
                state.sourceCurr = state.targetCurr === 'KRW' ? 'USD' : 'KRW';
                fxSourceCurrSelect.value = state.sourceCurr;
            }
            calculateFX();
        });

        btnSwapCurr.addEventListener('click', swapCurrencies);
        btnImportCalcResult.addEventListener('click', importCalcToFx);
    }

    function switchTab(viewName) {
        if (viewName === 'calc') {
            tabCalc.classList.add('active');
            tabCalc.setAttribute('aria-selected', 'true');
            tabFx.classList.remove('active');
            tabFx.setAttribute('aria-selected', 'false');
            calcView.classList.add('active');
            fxView.classList.remove('active');
        } else {
            tabFx.classList.add('active');
            tabFx.setAttribute('aria-selected', 'true');
            tabCalc.classList.remove('active');
            tabCalc.setAttribute('aria-selected', 'false');
            fxView.classList.add('active');
            calcView.classList.remove('active');
            calculateFX();
        }
    }

    function toggleDrawer(open) {
        if (open) {
            historyDrawer.classList.add('open');
        } else {
            historyDrawer.classList.remove('open');
        }
    }

    // ==========================================================================
    // 5. CALCULATOR CORE LOGIC
    // ==========================================================================
    function handleKeyClick(e) {
        const target = e.target.closest('.key');
        if (!target) return;

        const action = target.dataset.action;
        const value = target.dataset.value;

        if (action === 'all-clear') {
            clearAll();
        } else if (action === 'clear') {
            clearEntry();
        } else if (action === 'backspace') {
            handleBackspace();
        } else if (action === 'parenthesis') {
            handleParentheses();
        } else if (action === 'operator') {
            handleOperator(value);
        } else if (action === 'toggle-sign') {
            handleToggleSign();
        } else if (action === 'calculate') {
            evaluateExpression();
        } else if (value !== undefined) {
            handleNumberInput(value);
        }
    }

    function handleNumberInput(val) {
        if (state.isEvaluated) {
            state.calcExpression = '';
            state.calcCurrentInput = val === '.' ? '0.' : val;
            state.isEvaluated = false;
        } else {
            // If current expression ends with a closing parenthesis, insert multiplication automatically
            if (/\)\s*$/.test(state.calcExpression) && state.calcCurrentInput === '0') {
                state.calcExpression += '× ';
            }

            if (state.calcCurrentInput === '0' && val !== '.') {
                if (val === '00') return;
                state.calcCurrentInput = val;
            } else {
                if (val === '.' && state.calcCurrentInput.includes('.')) return;
                state.calcCurrentInput += val;
            }
        }
        updateCalcDisplay();
    }

    function handleOperator(op) {
        if (state.isEvaluated) {
            state.calcExpression = state.calcCurrentInput + ' ' + op + ' ';
            state.calcCurrentInput = '0';
            state.isEvaluated = false;
        } else {
            if (state.calcCurrentInput !== '0' || state.calcExpression === '') {
                state.calcExpression += state.calcCurrentInput + ' ' + op + ' ';
                state.calcCurrentInput = '0';
            } else if (state.calcExpression.length > 0) {
                // Replace last operator seamlessly
                state.calcExpression = state.calcExpression.replace(/[\+\-\×\÷\%]\s*$/, op + ' ');
            }
        }
        updateCalcDisplay();
    }

    function handleParentheses() {
        const openCount = (state.calcExpression.match(/\(/g) || []).length;
        const closeCount = (state.calcExpression.match(/\)/g) || []).length;

        if (state.isEvaluated) {
            state.calcExpression = '( ';
            state.calcCurrentInput = '0';
            state.isEvaluated = false;
            updateCalcDisplay();
            return;
        }

        if (openCount > closeCount) {
            // We can close a parenthesis if current input is not 0 or if expr ends with something valid
            if (state.calcCurrentInput !== '0') {
                state.calcExpression += state.calcCurrentInput + ' ) ';
                state.calcCurrentInput = '0';
            } else if (/\)\s*$/.test(state.calcExpression)) {
                // If expression ends with ')', just append another ')'
                state.calcExpression += ') ';
            } else if (state.calcExpression.endsWith('( ')) {
                // Ignore empty '()'
                return;
            } else {
                state.calcExpression += ') ';
            }
        } else {
            // Open a new parenthesis
            if (state.calcCurrentInput === '0') {
                if (/\)\s*$/.test(state.calcExpression)) {
                    state.calcExpression += '× ( ';
                } else {
                    state.calcExpression += '( ';
                }
            } else {
                state.calcExpression += state.calcCurrentInput + ' × ( ';
                state.calcCurrentInput = '0';
            }
        }
        updateCalcDisplay();
    }

    function handleToggleSign() {
        if (state.calcCurrentInput !== '0') {
            if (state.calcCurrentInput.startsWith('-')) {
                state.calcCurrentInput = state.calcCurrentInput.slice(1);
            } else {
                state.calcCurrentInput = '-' + state.calcCurrentInput;
            }
            updateCalcDisplay();
        }
    }

    function handleBackspace() {
        if (state.isEvaluated) {
            clearAll();
            return;
        }
        if (state.calcCurrentInput.length > 1) {
            state.calcCurrentInput = state.calcCurrentInput.slice(0, -1);
            if (state.calcCurrentInput === '-') state.calcCurrentInput = '0';
        } else {
            state.calcCurrentInput = '0';
        }
        updateCalcDisplay();
    }

    function clearAll() {
        state.calcExpression = '';
        state.calcCurrentInput = '0';
        state.isEvaluated = false;
        updateCalcDisplay();
    }

    function clearEntry() {
        state.calcCurrentInput = '0';
        updateCalcDisplay();
    }

    function evaluateExpression() {
        let fullExpr = state.calcExpression;

        // If currentInput is not zero, append it to fullExpr
        if (state.calcCurrentInput !== '0') {
            if (/\)\s*$/.test(fullExpr)) {
                fullExpr += '× ' + state.calcCurrentInput;
            } else {
                fullExpr += state.calcCurrentInput;
            }
        } else {
            if (!fullExpr) {
                fullExpr = '0';
            }
        }

        if (!fullExpr || fullExpr.trim() === '0') return;

        try {
            // 1. Convert symbols to standard JavaScript Operators
            let sanitized = fullExpr
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/%/g, '/100');

            // 2. Implicit multiplication fixes: e.g. 2(5-3) -> 2*(5-3), (5-3)2 -> (5-3)*2, (2)(3) -> (2)*(3)
            sanitized = sanitized
                .replace(/(\d)\s*\(/g, '$1*(')
                .replace(/\)\s*(\d)/g, ')*$1')
                .replace(/\)\s*\(/g, ')*(')
                .replace(/(\/100)\s*(\d)/g, '$1*$2')
                .replace(/(\/100)\s*\(/g, '$1*(');

            // 3. Remove trailing dangling operators (e.g. "2 + 3 + " -> "2 + 3")
            sanitized = sanitized.replace(/[\+\-\*\/]\s*$/, '');

            // 4. Auto close unclosed parentheses
            const openCount = (sanitized.match(/\(/g) || []).length;
            const closeCount = (sanitized.match(/\)/g) || []).length;
            if (openCount > closeCount) {
                sanitized += ')'.repeat(openCount - closeCount);
            }

            // 5. Evaluate Expression Safely
            const evaluatedResult = new Function(`'use strict'; return (${sanitized})`)();

            if (!isFinite(evaluatedResult) || isNaN(evaluatedResult)) {
                showToast('0으로 나눌 수 없습니다.');
                resultDisplay.textContent = '0으로 나눌 수 없음';
                return;
            }

            // Format result (round floating-point inaccuracies e.g. 0.1+0.2=0.3)
            const resultRounded = Math.round(evaluatedResult * 100000000) / 100000000;

            // Push to history
            addHistory(fullExpr, resultRounded);

            state.calcExpression = fullExpr + ' =';
            state.calcCurrentInput = resultRounded.toString();
            state.isEvaluated = true;
            updateCalcDisplay();

        } catch (err) {
            console.error('Eval Error:', err);
            showToast('수식이 올바르지 않습니다.');
            resultDisplay.textContent = '오류';
        }
    }

    function updateCalcDisplay() {
        expressionDisplay.textContent = state.calcExpression;

        const val = state.calcCurrentInput;
        if (val === '0') {
            resultDisplay.textContent = '0';
            return;
        }

        // Adjust font size dynamically for long numbers
        if (val.length > 12) {
            resultDisplay.style.fontSize = '1.8rem';
        } else if (val.length > 9) {
            resultDisplay.style.fontSize = '2.2rem';
        } else {
            resultDisplay.style.fontSize = '3rem';
        }

        // Format commas for display
        const parts = val.split('.');
        parts[0] = Number(parts[0]).toLocaleString('en-US');
        resultDisplay.textContent = parts.join('.');
    }

    function handleKeyboardInput(e) {
        // If history modal open or focusing on input element, ignore keyboard calc
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;

        if (e.key >= '0' && e.key <= '9') {
            handleNumberInput(e.key);
        } else if (e.key === '.') {
            handleNumberInput('.');
        } else if (e.key === '+') {
            handleOperator('+');
        } else if (e.key === '-') {
            handleOperator('-');
        } else if (e.key === '*' || e.key === 'x') {
            handleOperator('×');
        } else if (e.key === '/') {
            e.preventDefault();
            handleOperator('÷');
        } else if (e.key === '%') {
            handleOperator('%');
        } else if (e.key === 'Enter' || e.key === '=') {
            e.preventDefault();
            evaluateExpression();
        } else if (e.key === 'Backspace') {
            handleBackspace();
        } else if (e.key === 'Escape') {
            clearAll();
        }
    }

    // ==========================================================================
    // 6. HISTORY MANAGEMENT
    // ==========================================================================
    function addHistory(expression, result) {
        const item = {
            id: Date.now(),
            expression,
            result,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };
        state.history.unshift(item);
        if (state.history.length > 20) state.history.pop();
        localStorage.setItem('smart_calc_history', JSON.stringify(state.history));
        renderHistory();
    }

    function renderHistory() {
        if (state.history.length === 0) {
            historyList.innerHTML = '<div class="empty-history">최근 계산 기록이 없습니다.</div>';
            return;
        }

        historyList.innerHTML = state.history.map(item => `
            <div class="history-item" data-res="${item.result}">
                <div class="history-expr">${item.expression}</div>
                <div class="history-res">${Number(item.result).toLocaleString('en-US')}</div>
            </div>
        `).join('');

        historyList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                state.calcCurrentInput = el.dataset.res;
                state.calcExpression = '';
                state.isEvaluated = true;
                updateCalcDisplay();
                toggleDrawer(false);
                showToast('계산기에 수치를 불러왔습니다.');
            });
        });
    }

    function clearHistory() {
        state.history = [];
        localStorage.removeItem('smart_calc_history');
        renderHistory();
        showToast('계산 기록이 모두 삭제되었습니다.');
    }

    // ==========================================================================
    // 7. REAL-TIME FX & EXCHANGE RATE ENGINE
    // ==========================================================================
    async function fetchExchangeRates() {
        fxUpdateTime.textContent = '환율 정보를 갱신 중입니다...';

        try {
            const response = await fetch('https://open.er-api.com/v6/latest/USD');
            if (!response.ok) throw new Error('API 응답 실패');

            const data = await response.json();
            if (data && data.rates) {
                state.rates.USD = 1.0;
                state.rates.KRW = data.rates.KRW || 1385.50;
                state.rates.JPY = data.rates.JPY || 155.80;
                state.rates.CNY = data.rates.CNY || 7.26;
                state.lastFxUpdated = new Date();
                
                const timeStr = state.lastFxUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                fxUpdateTime.textContent = `실시간 고시 환율 (${timeStr} 기준)`;
                showToast('최신 환율 정보를 성공적으로 불러왔습니다.');
            }
        } catch (err) {
            console.warn('FX Fetch Fallback:', err);
            // Fallback default realistic exchange rate
            state.rates = { USD: 1.0, KRW: 1385.50, JPY: 155.80, CNY: 7.26 };
            fxUpdateTime.textContent = '기본 고시 환율 (네트워크 백업)';
        }

        renderMiniTicker();
        calculateFX();
    }

    function renderMiniTicker() {
        const krwUsd = state.rates.KRW; // 1 USD in KRW
        const krwJpy100 = (state.rates.KRW / state.rates.JPY) * 100; // 100 JPY in KRW
        const krwCny = state.rates.KRW / state.rates.CNY; // 1 CNY in KRW

        rateUsd.textContent = `₩ ${krwUsd.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
        rateJpy.textContent = `₩ ${krwJpy100.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
        rateCny.textContent = `₩ ${krwCny.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
    }

    /**
     * Calculate Exchange Rates with Spread & Discount Options
     */
    function calculateFX() {
        const { sourceAmount, sourceCurr, targetCurr, txMode, discountRate, rates } = state;

        if (!sourceAmount || sourceAmount <= 0) {
            fxFinalAmount.textContent = '0';
            fxFinalSymbol.textContent = CURRENCY_META[targetCurr].symbol;
            return;
        }

        // 1. Calculate Base Cross Rate (Source to Target)
        // Convert Source -> USD -> Target
        const sourceToUsd = 1 / rates[sourceCurr];
        const usdToTarget = rates[targetCurr];
        const baseCrossRate = sourceToUsd * usdToTarget;

        // 2. Calculate Bank Spread Rate
        const spreadPercent = FX_SPREADS[txMode];
        const effectiveSpread = spreadPercent * (1 - discountRate); // Discounted spread ratio

        let appliedRate = baseCrossRate;
        let zeroDiscountRate = baseCrossRate;

        // Applying Spread Direction based on transaction mode
        // Note: When converting foreign to KRW or vice versa
        if (txMode === 'cash-buy' || txMode === 'wire-send') {
            // Buying Foreign / Sending (Customer pays more base currency)
            appliedRate = baseCrossRate * (1 + effectiveSpread);
            zeroDiscountRate = baseCrossRate * (1 + spreadPercent);
        } else {
            // Selling Foreign / Receiving (Customer gets less base currency)
            appliedRate = baseCrossRate * (1 - effectiveSpread);
            zeroDiscountRate = baseCrossRate * (1 - spreadPercent);
        }

        // Final Converted Amount
        const finalConverted = sourceAmount * appliedRate;
        const zeroDiscountConverted = sourceAmount * zeroDiscountRate;

        // Saved Fee in KRW equivalent
        let savedFeeKRW = 0;
        const diffAmount = Math.abs(finalConverted - zeroDiscountConverted);
        
        // Convert diff amount to KRW for savings display
        const diffInUsd = targetCurr === 'USD' ? diffAmount : diffAmount / rates[targetCurr];
        savedFeeKRW = diffInUsd * rates.KRW;

        // 3. UI Update
        const targetMeta = CURRENCY_META[targetCurr];
        const sourceMeta = CURRENCY_META[sourceCurr];

        // Final Amount Formatting
        const formattedAmount = finalConverted.toLocaleString('ko-KR', {
            maximumFractionDigits: targetCurr === 'KRW' ? 0 : 2
        });

        fxFinalAmount.textContent = formattedAmount;
        fxFinalSymbol.textContent = targetMeta.symbol + ' (' + targetCurr + ')';

        // Exchange Detail Rate Text (e.g., 1 USD = 1,385.50 KRW)
        const unitRate = (1 * appliedRate).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
        fxExchangeDetailText.textContent = `적용 환율: 1 ${sourceCurr} = ${unitRate} ${targetCurr}`;

        // Update Breakdown Table
        bdBaseRate.textContent = `${baseCrossRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${targetCurr}`;
        bdAppliedRate.textContent = `${appliedRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${targetCurr}`;
        bdSavedFee.textContent = `약 ${Math.round(savedFeeKRW).toLocaleString('ko-KR')} 원 절약!`;

        // Update Transaction Mode Badge
        const txModeLabels = {
            'cash-buy': '현금 살 때',
            'cash-sell': '현금 팔 때',
            'wire-send': '송금 보내실 때',
            'wire-recv': '송금 받으실 때'
        };
        resTxBadge.textContent = `${txModeLabels[txMode]} (우대 ${Math.round(discountRate * 100)}%)`;
    }

    function swapCurrencies() {
        const temp = state.sourceCurr;
        state.sourceCurr = state.targetCurr;
        state.targetCurr = temp;

        fxSourceCurrSelect.value = state.sourceCurr;
        fxTargetCurrSelect.value = state.targetCurr;
        calculateFX();
    }

    // ==========================================================================
    // 8. INTER-MODULE SMART INTEGRATION
    // ==========================================================================
    function copyCalcResult() {
        const textToCopy = state.calcCurrentInput;
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`계산 결과(${textToCopy})가 클립보드에 복사되었습니다.`);
        }).catch(() => {
            showToast('복사에 실패했습니다.');
        });
    }

    function sendCalcResultToFx() {
        const val = parseFloat(state.calcCurrentInput);
        if (isNaN(val) || val <= 0) {
            showToast('유효한 계산 수치가 없습니다.');
            return;
        }
        state.sourceAmount = val;
        fxSourceAmountInput.value = val;
        switchTab('fx');
        showToast(`수치 ${val.toLocaleString()} 원/외화가 환율 계산기로 전달되었습니다.`);
    }

    function importCalcToFx() {
        const val = parseFloat(state.calcCurrentInput);
        if (isNaN(val) || val <= 0) {
            showToast('가져올 계산기 수치가 없습니다.');
            return;
        }
        state.sourceAmount = val;
        fxSourceAmountInput.value = val;
        calculateFX();
        showToast(`계산기 결과 (${val.toLocaleString()})를 성공적으로 반영했습니다.`);
    }

    // Toast Notification Helper
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2500);
    }

    // Launch Application
    init();
});
