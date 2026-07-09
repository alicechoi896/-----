const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");

let current = "0";
let previous = null;
let operator = null;
let justEvaluated = false;

const operatorSymbols = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

function updateDisplay() {
  resultEl.textContent = current;
  expressionEl.textContent =
    previous !== null && operator ? `${previous} ${operatorSymbols[operator]}` : "";
}

function inputDigit(digit) {
  if (justEvaluated) {
    current = digit === "." ? "0." : digit;
    justEvaluated = false;
    return;
  }
  if (digit === "." && current.includes(".")) return;
  if (current === "0" && digit !== ".") {
    current = digit;
  } else {
    current += digit;
  }
}

function clearAll() {
  current = "0";
  previous = null;
  operator = null;
  justEvaluated = false;
}

function negate() {
  current = String(parseFloat(current) * -1);
}

function percent() {
  current = String(parseFloat(current) / 100);
}

function compute(a, b, op) {
  switch (op) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function setOperator(nextOperator) {
  if (operator && previous !== null && !justEvaluated) {
    const result = compute(parseFloat(previous), parseFloat(current), operator);
    previous = formatResult(result);
    current = previous;
  } else {
    previous = current;
  }
  operator = nextOperator;
  justEvaluated = false;
}

function formatResult(value) {
  if (Number.isNaN(value)) return "오류";
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}

function equals() {
  if (operator === null || previous === null) return;
  const result = compute(parseFloat(previous), parseFloat(current), operator);
  current = formatResult(result);
  previous = null;
  operator = null;
  justEvaluated = true;
}

document.querySelector(".buttons").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn");
  if (!btn) return;

  const { value, action } = btn.dataset;

  if (value !== undefined) {
    inputDigit(value);
  } else if (action === "clear") {
    clearAll();
  } else if (action === "negate") {
    negate();
  } else if (action === "percent") {
    percent();
  } else if (action === "equals") {
    equals();
  } else if (["add", "subtract", "multiply", "divide"].includes(action)) {
    setOperator(action);
  }

  updateDisplay();
});

document.addEventListener("keydown", (e) => {
  const { key } = e;
  if (/^[0-9]$/.test(key)) inputDigit(key);
  else if (key === ".") inputDigit(".");
  else if (key === "+") setOperator("add");
  else if (key === "-") setOperator("subtract");
  else if (key === "*") setOperator("multiply");
  else if (key === "/") {
    e.preventDefault();
    setOperator("divide");
  } else if (key === "Enter" || key === "=") equals();
  else if (key === "Escape") clearAll();
  else if (key === "%") percent();
  else if (key === "Backspace") {
    current = current.length > 1 ? current.slice(0, -1) : "0";
  } else {
    return;
  }
  updateDisplay();
});

updateDisplay();
