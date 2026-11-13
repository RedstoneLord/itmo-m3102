// Plain labels only: preserve mathematical meaning without injecting markup or changing note sources.
const symbols = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  sim: '∼',
  equiv: '≡',
  infty: '∞',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  varnothing: '∅',
  emptyset: '∅',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  iff: '⇔',
  mid: '|',
  vert: '|',
  lvert: '|',
  rvert: '|',
  Vert: '‖',
  lVert: '‖',
  rVert: '‖',
  triangle: '△',
  sum: '∑',
  prod: '∏',
  int: '∫',
  partial: '∂',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  neg: '¬',
  land: '∧',
  lor: '∨',
  ldots: '…',
  cdots: '⋯',
  colon: ':',
};
const blackboard = { C: 'ℂ', N: 'ℕ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ', P: 'ℙ', H: 'ℍ' };
const scriptChars = (from, to) => Object.fromEntries([...from].map((char, i) => [char, [...to][i]]));
const superscript = scriptChars('0123456789+-=()niT', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵀ');
const subscript = scriptChars('0123456789+-=()aehijklmnoprstuvx', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ');

export function plainMathText(value) {
  const text = String(value ?? '');
  if (!/[\\$^_]/.test(text)) return text;
  let index = 0,
    matrix = 0;
  function argument() {
    while (/\s/.test(text[index] || '') && index < text.length) index++;
    if (text[index] === '{') {
      index++;
      return parse(true);
    }
    return token();
  }
  function token() {
    const char = text[index++];
    if (char === undefined) return '';
    if (char === '{') return parse(true);
    if (char === '$') return '';
    if (char === '&' && matrix) return ', ';
    if (char === '^' || char === '_') {
      const arg = argument(),
        alphabet = char === '^' ? superscript : subscript;
      return [...arg].every((c) => alphabet[c]) ? [...arg].map((c) => alphabet[c]).join('') : `${alphabet['(']}${arg}${alphabet[')']}`;
    }
    if (char !== '\\') return char;
    const match = /^[a-zA-Z]+/.exec(text.slice(index));
    if (!match) {
      const escaped = text[index++];
      return escaped === '\\' ? '; ' : escaped && ',;:! '.includes(escaped) ? ' ' : escaped && '()[]'.includes(escaped) ? '' : escaped || '';
    }
    const command = match[0];
    index += command.length;
    if (/^(left|right|big|Big|bigg|Bigg)[lr]?$/.test(command)) {
      if (text[index] === '.') index++;
      return '';
    }
    if (/^(frac|dfrac|tfrac)$/.test(command)) {
      const numerator = argument(),
        denominator = argument();
      const grouped = (part) => (/^[\p{L}\p{N}]+$/u.test(part) ? part : `(${part})`);
      return `(${grouped(numerator)}/${grouped(denominator)})`;
    }
    if (command === 'sqrt') return `√(${argument()})`;
    if (command === 'mathbb') {
      const arg = argument();
      return blackboard[arg] || arg;
    }
    if (/^(text|textrm|textbf|textit|mathrm|mathbf|mathit|mathcal|mathsf|mathtt|operatorname|mathbin|mathop|boldsymbol)$/.test(command))
      return argument();
    if (command === 'overline' || command === 'bar') {
      const arg = argument();
      return `${arg.length > 1 ? `(${arg})` : arg}̅`;
    }
    if (command === 'begin' || command === 'end') {
      const environment = argument();
      if (/matrix|cases/.test(environment)) {
        matrix += command === 'begin' ? 1 : -1;
        return command === 'begin' ? '(' : ')';
      }
      return '';
    }
    if (/^(quad|qquad|enspace|thinspace)$/.test(command)) return ' ';
    if (/^(displaystyle|textstyle|limits|nolimits)$/.test(command)) return '';
    return symbols[command] || command;
  }
  function parse(group = false) {
    let result = '';
    while (index < text.length) {
      if (group && text[index] === '}') {
        index++;
        break;
      }
      result += token();
    }
    return result;
  }
  return parse().replace(/\s+/g, ' ').trim();
}
