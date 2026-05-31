// BitForge Javascript Controller

// State Management
let currentMode = 'visual'; // 'visual', 'bin2dec', 'dec2bin'
let bitWidth = 8; // 8 or 16
let bits = Array(8).fill(0); // Holds 0s and 1s, MSB (index 0) to LSB (index 7)
let history = [];
let historyDebounceTimer = null;
let lastLoggedValue = null; // Prevent logging the same value repeatedly

// DOM Elements
const bitGrid = document.getElementById('bit-grid');
const binaryInput = document.getElementById('binary-input');
const decimalInput = document.getElementById('decimal-input');
const decimalDisplay = document.getElementById('decimal-display');
const binaryDisplay = document.getElementById('binary-display');
const mathFormula = document.getElementById('math-formula');
const mathFormulaRaw = document.getElementById('math-formula-raw');
const historyList = document.getElementById('history-list');
const binaryValidation = document.getElementById('binary-validation');
const decimalValidation = document.getElementById('decimal-validation');
const toastContainer = document.getElementById('toast-container');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    initEventListeners();
    renderGrid();
    updateDisplays();
});

function initEventListeners() {
    // Bit Width Radios
    const bitRadios = document.getElementsByName('bit-width');
    bitRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newWidth = parseInt(e.target.value, 10);
            changeBitWidth(newWidth);
        });
    });

    // Binary Text Input Event
    binaryInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^01]/g, ''); // strip non-binary characters
        
        // Show validation warning if user typed invalid chars
        if (e.target.value !== value) {
            binaryValidation.textContent = 'Only 0 and 1 are valid binary characters.';
            binaryValidation.style.opacity = 1;
        } else {
            binaryValidation.textContent = '';
            binaryValidation.style.opacity = 0;
        }
        
        e.target.value = value;
        
        if (value.length > 0) {
            // Check for bit width adjustment if string is too long for 8-bit
            if (value.length > 8 && bitWidth === 8) {
                setBitWidthRadio(16);
                bitWidth = 16;
            }
            
            // Pad or parse
            syncFromBinaryString(value);
        } else {
            resetState();
        }
    });

    // Decimal Text Input Event
    decimalInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^0-9]/g, ''); // strip non-numeric characters
        
        if (e.target.value !== value) {
            decimalValidation.textContent = 'Only positive integers are allowed.';
            decimalValidation.style.opacity = 1;
        } else {
            decimalValidation.textContent = '';
            decimalValidation.style.opacity = 0;
        }
        
        e.target.value = value;
        
        if (value.length > 0) {
            const decimalVal = parseInt(value, 10);
            const maxVal = Math.pow(2, 32) - 1; // Limit to 32-bit to avoid overflow
            
            if (decimalVal > maxVal) {
                decimalInput.value = maxVal;
                decimalValidation.textContent = 'Capped at maximum 32-bit unsigned integer (4,294,967,295).';
                decimalValidation.style.opacity = 1;
                syncFromDecimalValue(maxVal);
            } else {
                // Check if we should grow visual grid
                if (decimalVal > 255 && bitWidth === 8) {
                    setBitWidthRadio(16);
                    bitWidth = 16;
                }
                syncFromDecimalValue(decimalVal);
            }
        } else {
            resetState();
        }
    });
}

// Tab Switcher
function switchTab(mode) {
    currentMode = mode;
    
    // Update Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${mode}`).classList.add('active');
    
    // Update Views
    document.querySelectorAll('.tool-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${mode}`).classList.add('active');

    // Focus input if appropriate
    if (mode === 'bin2dec') {
        setTimeout(() => binaryInput.focus(), 150);
    } else if (mode === 'dec2bin') {
        setTimeout(() => decimalInput.focus(), 150);
    }
    
    showToast(`Switched to ${mode === 'visual' ? 'Interactive Bit Toggler' : mode === 'bin2dec' ? 'Binary to Decimal' : 'Decimal to Binary'} Mode`, 'info');
}

// Set Bit Width
function changeBitWidth(width) {
    bitWidth = width;
    const decimalValue = getDecimalValue();
    
    // Resize bit array preserving values from LSB side
    const newBits = Array(width).fill(0);
    for (let i = 1; i <= width; i++) {
        const oldIndex = bits.length - i;
        const newIndex = newBits.length - i;
        if (oldIndex >= 0) {
            newBits[newIndex] = bits[oldIndex];
        }
    }
    bits = newBits;
    
    // Update grid configuration class
    bitGrid.className = bitWidth === 16 ? 'bit-grid-16' : 'bit-grid-8';
    
    renderGrid();
    updateDisplays();
    showToast(`Grid resized to ${width}-bit representation`, 'info');
}

function setBitWidthRadio(width) {
    const radio = document.getElementById(`bits-${width}`);
    if (radio) {
        radio.checked = true;
        bitGrid.className = width === 16 ? 'bit-grid-16' : 'bit-grid-8';
    }
}

// Render the Interactive Bit Grid
function renderGrid() {
    bitGrid.innerHTML = '';
    
    for (let i = 0; i < bitWidth; i++) {
        const power = bitWidth - 1 - i;
        const placeValue = Math.pow(2, power);
        
        const bitBox = document.createElement('div');
        bitBox.className = `bit-box ${bits[i] === 1 ? 'active' : ''}`;
        bitBox.setAttribute('role', 'checkbox');
        bitBox.setAttribute('aria-checked', bits[i] === 1 ? 'true' : 'false');
        bitBox.setAttribute('tabindex', '0');
        bitBox.id = `bit-box-${power}`;
        bitBox.title = `Power: 2^${power} = ${placeValue}`;
        
        bitBox.innerHTML = `
            <span class="bit-val" id="bit-val-${power}">${bits[i]}</span>
            <span class="bit-pow" id="bit-pow-${power}">2<sup>${power}</sup></span>
        `;
        
        // Click and Keyboard Events
        bitBox.addEventListener('click', () => toggleBit(i));
        bitBox.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggleBit(i);
            }
        });
        
        bitGrid.appendChild(bitBox);
    }
}

// Toggle single bit
function toggleBit(index) {
    bits[index] = bits[index] === 1 ? 0 : 1;
    
    // Update specific bit element class and value instantly to feel extremely snappy
    const power = bitWidth - 1 - index;
    const bitBox = document.getElementById(`bit-box-${power}`);
    const bitVal = document.getElementById(`bit-val-${power}`);
    
    if (bitBox && bitVal) {
        const isActive = bits[index] === 1;
        bitBox.className = `bit-box ${isActive ? 'active' : ''}`;
        bitBox.setAttribute('aria-checked', isActive ? 'true' : 'false');
        bitVal.textContent = bits[index];
    }
    
    // Sync displays, fields and breakdown
    const decimalValue = getDecimalValue();
    const binaryStr = getBinaryString();
    
    // Sync text inputs silently (without looping validation)
    binaryInput.value = binaryStr;
    decimalInput.value = decimalValue;
    
    updateDisplaysOnly(decimalValue, binaryStr);
    
    // Debounce history save on clicks
    queueHistorySave(binaryStr, decimalValue);
}

// Quick Actions for Bits
function clearBits() {
    bits.fill(0);
    renderGrid();
    const dec = 0;
    const bin = getBinaryString();
    binaryInput.value = '';
    decimalInput.value = '';
    updateDisplaysOnly(dec, bin);
    showToast('Cleared all bits', 'info');
}

function fillBits() {
    bits.fill(1);
    renderGrid();
    syncOutputs();
    showToast('Set all bits to 1', 'info');
}

function invertBits() {
    bits = bits.map(b => b === 1 ? 0 : 1);
    renderGrid();
    syncOutputs();
    showToast('Inverted all bits', 'info');
}

// Sync from text input values
function syncFromBinaryString(binaryStr) {
    // Parse binary string
    const decimalVal = parseInt(binaryStr, 2);
    
    // Update bit array
    bits.fill(0);
    for (let i = 0; i < binaryStr.length; i++) {
        const bitVal = parseInt(binaryStr[binaryStr.length - 1 - i], 10);
        const bitIndex = bits.length - 1 - i;
        if (bitIndex >= 0) {
            bits[bitIndex] = bitVal;
        }
    }
    
    // Update decimal text input silently
    decimalInput.value = decimalVal;
    
    renderGrid();
    updateDisplaysOnly(decimalVal, binaryStr);
    queueHistorySave(binaryStr, decimalVal);
}

function syncFromDecimalValue(decimalVal) {
    let binaryStr = decimalVal.toString(2);
    
    // Pad to match grid if smaller than current bit width
    if (binaryStr.length < bitWidth) {
        binaryStr = binaryStr.padStart(bitWidth, '0');
    }
    
    // Update bit array
    bits.fill(0);
    for (let i = 0; i < binaryStr.length; i++) {
        const bitVal = parseInt(binaryStr[binaryStr.length - 1 - i], 10);
        const bitIndex = bits.length - 1 - i;
        if (bitIndex >= 0) {
            bits[bitIndex] = bitVal;
        }
    }
    
    // Update binary text input silently
    binaryInput.value = binaryStr;
    
    renderGrid();
    updateDisplaysOnly(decimalVal, binaryStr);
    queueHistorySave(binaryStr, decimalVal);
}

function syncOutputs() {
    const dec = getDecimalValue();
    const bin = getBinaryString();
    binaryInput.value = bin;
    decimalInput.value = dec;
    updateDisplaysOnly(dec, bin);
    queueHistorySave(bin, dec);
}

// Display Updates
function updateDisplays() {
    const decimalValue = getDecimalValue();
    const binaryStr = getBinaryString();
    updateDisplaysOnly(decimalValue, binaryStr);
}

function updateDisplaysOnly(decimalValue, binaryStr) {
    decimalDisplay.textContent = decimalValue.toLocaleString();
    
    // Format binary string into blocks of 4 for maximum readability
    const formattedBin = formatBinaryString(binaryStr);
    binaryDisplay.innerHTML = formattedBin;
    
    renderMathFormula(decimalValue, binaryStr);
}

function resetState() {
    bits.fill(0);
    renderGrid();
    decimalDisplay.textContent = '0';
    binaryDisplay.textContent = '00000000'.substring(0, bitWidth);
    mathFormula.innerHTML = '<span class="text-muted">0</span>';
    mathFormulaRaw.textContent = '0';
}

// Utilities
function getDecimalValue() {
    return bits.reduce((acc, val, idx) => acc + val * Math.pow(2, bits.length - 1 - idx), 0);
}

function getBinaryString() {
    return bits.join('');
}

function formatBinaryString(binStr) {
    // If it's a long binary string, split it into 4-bit chunks with thin spaces
    if (binStr.length <= 4) return binStr;
    
    const chunks = [];
    // Start from right (LSB) to group correctly
    for (let i = binStr.length; i > 0; i -= 4) {
        const start = Math.max(0, i - 4);
        chunks.unshift(binStr.substring(start, i));
    }
    return chunks.join('<span class="bin-separator">&nbsp;</span>');
}

function renderMathFormula(decimalValue, binaryStr) {
    if (decimalValue === 0) {
        mathFormula.innerHTML = '<span class="text-muted">0</span>';
        mathFormulaRaw.textContent = '0';
        return;
    }
    
    // Clean binary representation (no leading zeros for math formula, unless it's just '0')
    const trimmedBin = binaryStr.replace(/^0+/, '');
    if (trimmedBin === '') {
        mathFormula.innerHTML = '<span class="text-muted">0</span>';
        mathFormulaRaw.textContent = '0';
        return;
    }
    
    const terms = [];
    const rawTerms = [];
    const activeTerms = [];
    
    const len = trimmedBin.length;
    for (let i = 0; i < len; i++) {
        const power = len - 1 - i;
        const bit = trimmedBin[i];
        const placeValue = Math.pow(2, power);
        
        if (bit === '1') {
            terms.push(`<span class="term">1×2<sup>${power}</sup></span>`);
            rawTerms.push(`(1 * 2^${power})`);
            activeTerms.push(placeValue);
        } else {
            terms.push(`<span class="text-muted">0×2<sup>${power}</sup></span>`);
            rawTerms.push(`(0 * 2^${power})`);
        }
    }
    
    // HTML presentation
    let htmlContent = terms.join('<span class="math-op">+</span>');
    
    // Add sum calculation step if more than one bit is active
    if (activeTerms.length > 0) {
        htmlContent += `<span class="math-equals">=</span>`;
        
        // Show sum of positive place values
        const sumTerms = [];
        for (let i = 0; i < len; i++) {
            const power = len - 1 - i;
            const bit = trimmedBin[i];
            const val = Math.pow(2, power);
            if (bit === '1') {
                sumTerms.push(`<span class="term">${val}</span>`);
            } else {
                sumTerms.push(`<span class="text-muted">0</span>`);
            }
        }
        
        htmlContent += sumTerms.join('<span class="math-op">+</span>');
        htmlContent += `<span class="math-equals">=</span><span class="math-res">${decimalValue}</span>`;
    }
    
    mathFormula.innerHTML = htmlContent;
    
    // Raw plain-text equation for copying
    const rawEq = rawTerms.join(' + ') + ' = ' + activeTerms.join(' + ') + ' = ' + decimalValue;
    mathFormulaRaw.textContent = rawEq;
}

// Preset Actions
function setBinaryPreset(preset) {
    binaryInput.value = preset;
    binaryValidation.textContent = '';
    binaryValidation.style.opacity = 0;
    
    if (preset.length > 8 && bitWidth === 8) {
        setBitWidthRadio(16);
        bitWidth = 16;
    }
    
    syncFromBinaryString(preset);
    showToast(`Loaded binary sample: ${preset}`, 'success');
}

function setDecimalPreset(preset) {
    decimalInput.value = preset;
    decimalValidation.textContent = '';
    decimalValidation.style.opacity = 0;
    
    const decVal = parseInt(preset, 10);
    if (decVal > 255 && bitWidth === 8) {
        setBitWidthRadio(16);
        bitWidth = 16;
    }
    
    syncFromDecimalValue(decVal);
    showToast(`Loaded decimal sample: ${preset}`, 'success');
}

function clearInput(id) {
    const input = document.getElementById(id);
    if (input) {
        input.value = '';
        input.focus();
        
        // Reset errors
        binaryValidation.textContent = '';
        binaryValidation.style.opacity = 0;
        decimalValidation.textContent = '';
        decimalValidation.style.opacity = 0;
        
        resetState();
        showToast('Input cleared', 'info');
    }
}

// Copy to Clipboard
function copyText(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let textToCopy = element.innerText || element.textContent;
    // Strip thin spaces or NBSPs from binary if copying binary
    if (elementId === 'binary-display') {
        textToCopy = textToCopy.replace(/\s/g, '');
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        const friendlyName = elementId === 'decimal-display' ? 'Decimal value' : 
                             elementId === 'binary-display' ? 'Binary string' : 'Formula equation';
        showToast(`${friendlyName} copied to clipboard!`, 'success');
    }).catch(err => {
        showToast('Failed to copy text.', 'error');
        console.error('Clipboard copy failed: ', err);
    });
}

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Choose appropriate SVG icon based on toast type
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else { // info
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    // Slide out after 3 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        // Remove from DOM after transition completes
        toast.addEventListener('animationend', (e) => {
            if (e.animationName === 'toastSlideOut') {
                toast.remove();
            }
        });
    }, 2800);
}

// History Management
function loadHistory() {
    try {
        const storedHistory = localStorage.getItem('bitforge_history');
        if (storedHistory) {
            history = JSON.parse(storedHistory);
            renderHistory();
        }
    } catch (err) {
        console.error('Error loading history: ', err);
    }
}

function saveHistory() {
    try {
        localStorage.setItem('bitforge_history', JSON.stringify(history));
    } catch (err) {
        console.error('Error saving history: ', err);
    }
}

function queueHistorySave(binary, decimal) {
    if (decimal === 0) return; // Don't log empty zeros
    
    // Debounce to prevent clogging history on rapid toggles
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
    
    historyDebounceTimer = setTimeout(() => {
        // Skip if same as last logged value
        if (decimal === lastLoggedValue) return;
        
        lastLoggedValue = decimal;
        
        // Remove existing identical entry if it exists (so we push to top)
        history = history.filter(item => item.decimal !== decimal);
        
        // Add new item at top
        history.unshift({ binary, decimal, timestamp: Date.now() });
        
        // Cap history size to 10 entries
        if (history.length > 10) {
            history.pop();
        }
        
        saveHistory();
        renderHistory();
    }, 1200);
}

function renderHistory() {
    historyList.innerHTML = '';
    
    if (history.length === 0) {
        historyList.innerHTML = '<li class="empty-history">No conversions in history yet.</li>';
        return;
    }
    
    history.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        // Clean display binary by stripping leading zeros beyond 8 bits to keep it clean
        const shortBin = item.binary.length > 8 ? item.binary.replace(/^0{1,8}(?=\d{8})/, '') : item.binary;
        
        li.innerHTML = `
            <div class="hist-values" onclick="restoreFromHistory('${item.binary}', ${item.decimal})" title="Restore this conversion">
                <span class="hist-bin">${shortBin}</span>
                <span class="hist-arrow">&rarr;</span>
                <span class="hist-dec">${item.decimal.toLocaleString()}</span>
            </div>
            <button class="btn-delete-hist" onclick="deleteHistoryItem(${index})" title="Delete entry">&times;</button>
        `;
        
        historyList.appendChild(li);
    });
}

function restoreFromHistory(binary, decimal) {
    // Determine required bit width based on binary length
    const reqWidth = binary.length > 8 ? 16 : 8;
    
    if (reqWidth !== bitWidth) {
        setBitWidthRadio(reqWidth);
        bitWidth = reqWidth;
        bitGrid.className = reqWidth === 16 ? 'bit-grid-16' : 'bit-grid-8';
    }
    
    // Load binary directly into bit array
    bits = Array(bitWidth).fill(0);
    for (let i = 0; i < binary.length; i++) {
        const val = parseInt(binary[binary.length - 1 - i], 10);
        const index = bits.length - 1 - i;
        if (index >= 0) {
            bits[index] = val;
        }
    }
    
    // Set field values
    binaryInput.value = binary;
    decimalInput.value = decimal;
    
    renderGrid();
    updateDisplaysOnly(decimal, binary);
    
    showToast(`Restored conversion: ${decimal}`, 'success');
}

function deleteHistoryItem(index) {
    event.stopPropagation(); // Prevent trigger parent restore click
    history.splice(index, 1);
    saveHistory();
    renderHistory();
    showToast('History entry deleted', 'info');
}

function clearHistory() {
    history = [];
    lastLoggedValue = null;
    saveHistory();
    renderHistory();
    showToast('Conversion history cleared', 'success');
}
