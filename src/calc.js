/**
 * Offline math-expression evaluator for the Spotlight search bar (see src/dashboard.js's
 * onSearchInput/onSearchSubmit). Deliberately hand-rolled instead of using eval()/new Function():
 * this extension runs under Manifest V3's default script-src 'self' CSP (see the comment on
 * Alpine's CSP build in index.html), which blocks both outright.
 *
 * evaluateMathExpression(input) returns a finite number if `input` is a valid arithmetic
 * expression containing at least one binary operator, or null otherwise (including for plain
 * search terms, bare numbers like "42", or malformed input) — null means "treat this as a normal
 * search", not "math error".
 *
 * Grammar (standard precedence, ^ right-associative and binding tighter than unary +/-, so
 * "-2^2" reads as -(2^2) = -4, matching normal math notation):
 *   expr   := term (("+" | "-") term)*
 *   term   := unary (("*" | "/" | "%") unary)*
 *   unary  := ("+" | "-")? power
 *   power  := primary ("^" unary)?
 *   primary:= NUMBER | "(" expr ")"
 */

function evaluateMathExpression(input) {
    if (typeof input !== "string") return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    // Whitelist: only digits, whitespace, and the operators/parens/decimal point this grammar
    // understands. Anything else (letters, currency symbols, ...) means it's not a math
    // expression at all, so bail out before touching the parser.
    if (!/^[\d\s+\-*/().^%]+$/.test(trimmed)) return null;

    const tokens = tokenizeMathExpression(trimmed);
    if (!tokens) return null;

    const parser = { tokens, pos: 0, usedBinaryOperator: false };

    try {
        const value = parseExpr(parser);
        if (parser.pos !== tokens.length) return null; // leftover, unparsed tokens -> malformed
        if (!parser.usedBinaryOperator) return null; // e.g. a bare "42" or "(5)" — not a calculation
        if (!Number.isFinite(value)) return null; // division by zero etc.
        return roundMathResult(value);
    } catch (error) {
        return null;
    }
}

function tokenizeMathExpression(str) {
    const tokens = [];
    const re = /\s*(\d+(?:\.\d+)?|[+\-*/^%()])/g;
    let lastIndex = 0;
    let match;

    while ((match = re.exec(str)) !== null) {
        if (match.index !== lastIndex) return null; // gap = an unrecognized character sequence
        tokens.push(/\d/.test(match[1][0]) ? { type: "number", value: Number(match[1]) } : { type: match[1] });
        lastIndex = re.lastIndex;
    }

    if (lastIndex !== str.length) return null;
    return tokens;
}

function peek(parser) {
    return parser.tokens[parser.pos];
}

function expectOp(parser, type) {
    const token = peek(parser);
    if (!token || token.type !== type) throw new Error(`expected "${type}"`);
    parser.pos++;
}

function parseExpr(parser) {
    let value = parseTerm(parser);

    for (let token = peek(parser); token && (token.type === "+" || token.type === "-"); token = peek(parser)) {
        parser.pos++;
        parser.usedBinaryOperator = true;
        const rhs = parseTerm(parser);
        value = token.type === "+" ? value + rhs : value - rhs;
    }

    return value;
}

function parseTerm(parser) {
    let value = parseUnary(parser);

    for (let token = peek(parser); token && (token.type === "*" || token.type === "/" || token.type === "%"); token = peek(parser)) {
        parser.pos++;
        parser.usedBinaryOperator = true;
        const rhs = parseUnary(parser);
        value = token.type === "*" ? value * rhs : token.type === "/" ? value / rhs : value % rhs;
    }

    return value;
}

function parseUnary(parser) {
    const token = peek(parser);
    if (token && (token.type === "+" || token.type === "-")) {
        parser.pos++;
        const value = parsePower(parser);
        return token.type === "-" ? -value : value;
    }
    return parsePower(parser);
}

function parsePower(parser) {
    const base = parsePrimary(parser);

    const token = peek(parser);
    if (token && token.type === "^") {
        parser.pos++;
        parser.usedBinaryOperator = true;
        const exponent = parseUnary(parser); // right-associative, and allows "2^-1"
        return Math.pow(base, exponent);
    }

    return base;
}

function parsePrimary(parser) {
    const token = peek(parser);
    if (!token) throw new Error("unexpected end of input");

    if (token.type === "number") {
        parser.pos++;
        return token.value;
    }

    if (token.type === "(") {
        parser.pos++;
        const value = parseExpr(parser);
        expectOp(parser, ")");
        return value;
    }

    throw new Error(`unexpected token "${token.type}"`);
}

// Strips the float noise that pure binary arithmetic produces (e.g. 0.1 + 0.2 -> 0.30000000000000004)
// while still preserving magnitude for very large/small results.
function roundMathResult(value) {
    return parseFloat(value.toPrecision(12));
}
