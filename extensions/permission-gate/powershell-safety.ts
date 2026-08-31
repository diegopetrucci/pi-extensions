const powerShellRemoveCommands = new Set(["remove-item", "del", "erase", "rd", "ri", "rm", "rmdir"]);
const dynamicPowerShellCommands = new Set([
	"cmd",
	"cmd.exe",
	"icm",
	"ii",
	"iex",
	"invoke-command",
	"invoke-expression",
	"invoke-item",
	"powershell",
	"powershell.exe",
	"pwsh",
	"pwsh.exe",
	"saps",
	"sajb",
	"start",
	"start-job",
	"start-process",
	"start-threadjob",
]);
const shellPowerShellCommands = new Set(["bash", "bash.exe", "sh", "sh.exe", "wsl", "wsl.exe"]);
const commandResolutionPowerShellCommands = new Set([
	"import-alias",
	"import-module",
	"import-pssession",
	"ipal",
	"ipmo",
	"ipsn",
	"nal",
	"new-alias",
	"new-module",
	"nmo",
	"ral",
	"remove-alias",
	"remove-module",
	"rmo",
	"sal",
	"set-alias",
]);
const commandDefinitionPowerShellKeywords = new Set(["filter", "function", "workflow"]);
const providerMutationPowerShellCommands = new Set([
	"ac",
	"add-content",
	"clear-content",
	"clear-item",
	"cd",
	"chdir",
	"clc",
	"cli",
	"copy-item",
	"cp",
	"cpi",
	"del",
	"erase",
	"move-item",
	"mi",
	"move",
	"mv",
	"new-item",
	"ni",
	"push-location",
	"pushd",
	"rd",
	"remove-item",
	"rename-item",
	"ren",
	"ri",
	"rm",
	"rmdir",
	"rni",
	"sc",
	"set-content",
	"set-item",
	"set-location",
	"si",
	"sl",
]);

const MAX_LEXICAL_DEPTH = 32;
export const MAX_POWERSHELL_ANALYSIS_SOURCE_BYTES = 16_000;

export const POWERSHELL_AST_MARKER = "PI_PERMISSION_GATE_AST:";

/**
 * Runs inside the same PowerShell installation used by Pi's built-in tool.
 * It parses but never invokes the candidate command and returns only the
 * bounded command metadata needed by the guard.
 */
export const POWERSHELL_AST_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
    try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
    if ([string]::IsNullOrWhiteSpace($encodedSource)) { throw 'missing encoded command' }
    $source = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encodedSource))
    $parseTokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$parseTokens, [ref]$parseErrors)
	    $commands = @(
        $ast.FindAll({
            param($node)
            $node -is [System.Management.Automation.Language.CommandAst]
        }, $true) | ForEach-Object {
            $commandAst = $_
            $elements = @(
                $commandAst.CommandElements | ForEach-Object {
                    $element = $_
                    $parameter = $null
                    $argument = $null
                    $splatted = $false
                    if ($element -is [System.Management.Automation.Language.CommandParameterAst]) {
                        $parameter = $element.ParameterName
                        if ($null -ne $element.Argument) { $argument = $element.Argument.Extent.Text }
                    }
                    if ($element -is [System.Management.Automation.Language.VariableExpressionAst]) {
                        $splatted = $element.Splatted
                    }
                    [pscustomobject]@{
                        type = $element.GetType().Name
                        text = $element.Extent.Text
                        parameter = $parameter
                        argument = $argument
                        splatted = [bool]$splatted
                    }
                }
            )
            [pscustomobject]@{
                name = $commandAst.GetCommandName()
                invocationOperator = [string]$commandAst.InvocationOperator
                elements = $elements
            }
	        }
	    )
	    $dynamicInvocationCount = @(
	        $ast.FindAll({
	            param($node)
	            if ($node -is [System.Management.Automation.Language.UsingStatementAst]) {
	                return [string]$node.UsingStatementKind -eq 'Module'
	            }
	            if ($node -isnot [System.Management.Automation.Language.InvokeMemberExpressionAst]) {
	                return $false
	            }
	            if ($node.Member -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) {
	                return $true
	            }
	            $memberName = [string]$node.Member.Value
	            if ($memberName -match '(?i)^(?:BeginInvoke|Create|CreateProcess\w*|EndInvoke|Exec|Execute|Invoke(?:ReturnAsIs|Script|WithContext)?|Run|ShellExecute\w*|Start|WinExec)$') {
	                return $true
	            }
	            $text = $node.Extent.Text
	            return (
	                $text -match '(?i)\.(?:BeginInvoke|Create|EndInvoke|Exec|Execute|Invoke(?:ReturnAsIs|Script|WithContext)?|Run|Start)\s*\(' -or
	                $text -match '(?i)\[\s*(?:System\.)?Diagnostics\.Process\s*\]\s*::\s*Start\s*\(' -or
	                $text -match '(?i)::\s*(?:CreateProcess\w*|ShellExecute\w*|WinExec)\s*\(' -or
	                $text -match '(?i)\[\s*(?:System\.)?(?:Management\.Automation\.)?ScriptBlock\s*\]\s*::\s*Create\s*\(' -or
	                $text -match '(?i)\[\s*(?:(?:System\.)?Management\.Automation\.)?PowerShell\s*\]\s*::\s*Create\s*\('
	            )
	        }, $true)
	    ).Count
	    $functionDefinitionCount = @(
	        $ast.FindAll({
	            param($node)
	            $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
	        }, $true)
	    ).Count
	    $payload = [pscustomobject]@{
	        parseErrors = @($parseErrors | ForEach-Object { $_.Message })
	        commands = $commands
	        dynamicInvocationCount = $dynamicInvocationCount
	        functionDefinitionCount = $functionDefinitionCount
	    }
    [Console]::Out.WriteLine('${POWERSHELL_AST_MARKER}' + ($payload | ConvertTo-Json -Depth 8 -Compress))
} catch {
    $payload = [pscustomobject]@{ analyzerError = $_.Exception.Message }
    [Console]::Out.WriteLine('${POWERSHELL_AST_MARKER}' + ($payload | ConvertTo-Json -Depth 4 -Compress))
    exit 1
}
`;

export function buildPowerShellAstCommand(command: string): string {
	const encodedCommand = Buffer.from(command, "utf8").toString("base64");
	return `$encodedSource = '${encodedCommand}'\n${POWERSHELL_AST_SCRIPT}`;
}

export type PowerShellSafetyAnalysis = {
	risky: boolean;
	reason?: string;
};

type PowerShellLexToken = {
	kind: "word" | "string" | "operator" | "separator" | "nested";
	text: string;
	dynamic?: boolean;
	nestedSources?: string[];
};

type PowerShellLexResult = {
	tokens: PowerShellLexToken[];
	malformed: boolean;
};

type PowerShellAstElement = {
	type: string;
	text: string;
	parameter: string | null;
	argument: string | null;
	splatted: boolean;
};

type PowerShellAstCommand = {
	name: string | null;
	invocationOperator: string;
	elements: PowerShellAstElement[];
};

function risky(reason: string): PowerShellSafetyAnalysis {
	return { risky: true, reason };
}

const safe: PowerShellSafetyAnalysis = { risky: false };

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function powerShellCommandName(rawName: string): string {
	const basename = rawName.trim().split(/[\\/]/).at(-1) ?? rawName;
	return basename.toLowerCase();
}

function isPowerShellScriptCommand(commandName: string): boolean {
	return /\.(?:ps1|psm1)$/i.test(commandName);
}

function containsCommandProviderPath(values: Iterable<string>): boolean {
	for (const value of values) {
		if (/(?:alias|function)\s*:/i.test(value)) return true;
	}
	return false;
}

function hasDynamicLexicalArguments(tokens: PowerShellLexToken[]): boolean {
	return tokens.some(
		(token) =>
			token.kind === "nested" ||
			token.dynamic === true ||
			(token.kind === "word" && /^(?:\$|@(?!\{))/.test(token.text)),
	);
}

function hasDynamicAstArguments(elements: PowerShellAstElement[]): boolean {
	return elements.some(
		(element) =>
			element.splatted ||
			!["CommandParameterAst", "ConstantExpressionAst", "StringConstantExpressionAst"].includes(element.type),
	);
}

function isDynamicMemberInvocationToken(token: PowerShellLexToken): boolean {
	if (token.kind !== "word") return false;
	const normalized = token.text
		.replace(/`\r?\n/g, "")
		.replace(/`(.)/gs, "$1");
	return (
		/\.\$/.test(normalized) ||
		/^(?:\$|@).+\.$/.test(normalized) ||
		/^\[.+\]::$/.test(normalized) ||
		/\.(?:begininvoke|create|createprocess\w*|endinvoke|exec|execute|invoke(?:returnasis|script|withcontext)?|run|shellexecute\w*|start|winexec)$/i.test(normalized) ||
		/^\[(?:system\.)?diagnostics\.process\]::start$/i.test(normalized) ||
		/::(?:createprocess\w*|shellexecute\w*|winexec)$/i.test(normalized) ||
		/^\[(?:system\.)?(?:management\.automation\.)?scriptblock\]::create$/i.test(normalized) ||
		/^\[(?:(?:system\.)?management\.automation\.)?powershell\]::create$/i.test(normalized)
	);
}

function hasDangerousQuotedMemberInvocation(tokens: PowerShellLexToken[]): boolean {
	for (let index = 1; index < tokens.length - 1; index += 1) {
		const previous = tokens[index - 1];
		const member = tokens[index];
		const callArguments = tokens[index + 1];
		if (
			member.kind !== "string" ||
			previous.kind !== "word" ||
			!/(?:\.|::)$/.test(previous.text) ||
			callArguments.kind !== "nested"
		) {
			continue;
		}
		if (
			member.dynamic ||
			/^(?:begininvoke|create|createprocess\w*|endinvoke|exec|execute|invoke(?:returnasis|script|withcontext)?|run|shellexecute\w*|start|winexec)$/i.test(
				member.text,
			)
		) {
			return true;
		}
	}
	return false;
}

function isFalseLiteral(value: string | null | undefined): boolean {
	return /^(?:\$?false|0)$/i.test(value?.trim() ?? "");
}

function isTrueLiteral(value: string | null | undefined): boolean {
	return /^(?:\$?true|1)$/i.test(value?.trim() ?? "");
}

function parameterMatches(parameter: string, kind: "recurse" | "force" | "whatIf"): boolean {
	const normalized = parameter
		.replace(/`\r?\n/g, "")
		.replace(/`(.)/gs, "$1")
		.replace(/^-+/, "")
		.toLowerCase();
	if (kind === "recurse") return /^r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?$/.test(normalized);
	if (kind === "force") return /^fo(?:r(?:c(?:e)?)?)?$/.test(normalized);
	return /^wh(?:a(?:t(?:i(?:f)?)?)?)?$/.test(normalized);
}

function parseLexicalParameter(token: string): { name: string; value?: string } | undefined {
	if (!token.startsWith("-") || token === "-") return undefined;
	const colon = token.indexOf(":");
	if (colon === -1) return { name: token };
	return { name: token.slice(0, colon), value: token.slice(colon + 1) };
}

function isPotentiallyEnabledSwitch(
	name: string,
	value: string | null | undefined,
	kind: "recurse" | "force",
): boolean {
	return parameterMatches(name, kind) && !isFalseLiteral(value);
}

function isDefinitelyEnabledWhatIf(name: string, value: string | null | undefined): boolean {
	if (!parameterMatches(name, "whatIf")) return false;
	return value === undefined || value === null || isTrueLiteral(value);
}

function findClosingParenthesis(source: string, openIndex: number): number {
	let depth = 1;
	let quote: "'" | '"' | undefined;
	let blockCommentDepth = 0;

	for (let index = openIndex + 1; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];

		if (blockCommentDepth > 0) {
			if (char === "<" && next === "#") {
				blockCommentDepth += 1;
				index += 1;
				continue;
			}
			if (char === "#" && next === ">") {
				blockCommentDepth -= 1;
				index += 1;
			}
			continue;
		}

		if (quote === "'") {
			if (char === "'" && next === "'") {
				index += 1;
				continue;
			}
			if (char === "'") quote = undefined;
			continue;
		}

		if (quote === '"') {
			if (char === "`") {
				if (next === "\r" && source[index + 2] === "\n") index += 2;
				else if (next !== undefined) index += 1;
				continue;
			}
			if (char === '"') quote = undefined;
			continue;
		}

		if (char === "`") {
			if (next === "\r" && source[index + 2] === "\n") index += 2;
			else if (next !== undefined) index += 1;
			continue;
		}
		if (char === "#") {
			while (index + 1 < source.length && source[index + 1] !== "\n") index += 1;
			continue;
		}
		if (char === "<" && next === "#") {
			blockCommentDepth = 1;
			index += 1;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === "(") depth += 1;
		if (char === ")") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}

	return -1;
}

function readQuotedToken(
	source: string,
	startIndex: number,
	quote: "'" | '"',
): { token: PowerShellLexToken; endIndex: number; malformed: boolean } {
	let text = "";
	let dynamic = false;
	const nestedSources: string[] = [];

	for (let index = startIndex + 1; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];

		if (quote === "'" && char === "'" && next === "'") {
			text += "'";
			index += 1;
			continue;
		}

		if (quote === '"' && char === "`") {
			if (next === "\r" && source[index + 2] === "\n") {
				index += 2;
				continue;
			}
			if (next === "\n") {
				index += 1;
				continue;
			}
			if (next !== undefined) {
				text += next;
				index += 1;
				continue;
			}
		}

		if (char === quote) {
			return {
				token: {
					kind: "string",
					text,
					dynamic,
					...(nestedSources.length ? { nestedSources } : {}),
				},
				endIndex: index,
				malformed: false,
			};
		}

		if (quote === '"' && char === "$" && next === "(") {
			const closingIndex = findClosingParenthesis(source, index + 1);
			if (closingIndex === -1) {
				return {
					token: { kind: "string", text, dynamic: true, nestedSources },
					endIndex: source.length - 1,
					malformed: true,
				};
			}
			nestedSources.push(source.slice(index + 2, closingIndex));
			dynamic = true;
			index = closingIndex;
			continue;
		}

		if (quote === '"' && char === "$" && /[A-Za-z_{]/.test(next ?? "")) dynamic = true;
		text += char;
	}

	return {
		token: { kind: "string", text, dynamic: true, ...(nestedSources.length ? { nestedSources } : {}) },
		endIndex: source.length - 1,
		malformed: true,
	};
}

function readHereStringToken(
	source: string,
	startIndex: number,
	quote: "'" | '"',
): { token: PowerShellLexToken; endIndex: number; malformed: boolean } | undefined {
	const openerEnd = startIndex + 2;
	let contentStart: number;
	if (source[openerEnd] === "\r" && source[openerEnd + 1] === "\n") contentStart = openerEnd + 2;
	else if (source[openerEnd] === "\n") contentStart = openerEnd + 1;
	else return undefined;

	let closingMarker = -1;
	let contentEnd = source.length;
	for (let lineStart = contentStart; lineStart <= source.length; ) {
		let marker = lineStart;
		while (source[marker] === " " || source[marker] === "\t") marker += 1;
		if (source[marker] === quote && source[marker + 1] === "@") {
			closingMarker = marker;
			contentEnd = lineStart;
			break;
		}
		const newline = source.indexOf("\n", lineStart);
		if (newline === -1) break;
		lineStart = newline + 1;
	}

	const text = source.slice(contentStart, contentEnd);
	let dynamic = false;
	let malformed = closingMarker === -1;
	const nestedSources: string[] = [];
	if (quote === '"') {
		for (let index = 0; index < text.length; index += 1) {
			const char = text[index];
			const next = text[index + 1];
			if (char === "`") {
				if (next !== undefined) index += 1;
				continue;
			}
			if (char === "$" && next === "(") {
				const closingIndex = findClosingParenthesis(text, index + 1);
				if (closingIndex === -1) {
					malformed = true;
					break;
				}
				nestedSources.push(text.slice(index + 2, closingIndex));
				dynamic = true;
				index = closingIndex;
				continue;
			}
			if (char === "$" && /[A-Za-z_{]/.test(next ?? "")) dynamic = true;
		}
	}

	return {
		token: {
			kind: "string",
			text,
			dynamic,
			...(nestedSources.length ? { nestedSources } : {}),
		},
		endIndex: closingMarker === -1 ? source.length - 1 : closingMarker + 1,
		malformed,
	};
}

function tokenizePowerShell(source: string): PowerShellLexResult {
	const tokens: PowerShellLexToken[] = [];
	let current = "";
	let malformed = false;
	let braceDepth = 0;

	const flush = () => {
		if (!current) return;
		tokens.push({ kind: "word", text: current });
		current = "";
	};

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];

		if (char === "`") {
			if (next === "\r" && source[index + 2] === "\n") {
				index += 2;
				continue;
			}
			if (next === "\n") {
				index += 1;
				continue;
			}
			if (next === undefined) {
				malformed = true;
				continue;
			}
			current += next;
			index += 1;
			continue;
		}

		if (char === "<" && next === "#") {
			flush();
			let depth = 1;
			index += 2;
			for (; index < source.length && depth > 0; index += 1) {
				if (source[index] === "<" && source[index + 1] === "#") {
					depth += 1;
					index += 1;
				} else if (source[index] === "#" && source[index + 1] === ">") {
					depth -= 1;
					index += 1;
				}
			}
			if (depth > 0) malformed = true;
			index -= 1;
			continue;
		}

		if (char === "#") {
			flush();
			while (index + 1 < source.length && source[index + 1] !== "\n") index += 1;
			continue;
		}

		if (char === "@" && (next === "'" || next === '"')) {
			const hereString = readHereStringToken(source, index, next);
			if (hereString) {
				flush();
				tokens.push(hereString.token);
				malformed ||= hereString.malformed;
				index = hereString.endIndex;
				continue;
			}
		}

		if (char === "'" || char === '"') {
			flush();
			const quoted = readQuotedToken(source, index, char);
			tokens.push(quoted.token);
			malformed ||= quoted.malformed;
			index = quoted.endIndex;
			continue;
		}

		if ((char === "$" || char === "@") && next === "(") {
			flush();
			const closingIndex = findClosingParenthesis(source, index + 1);
			if (closingIndex === -1) {
				malformed = true;
				break;
			}
			tokens.push({ kind: "nested", text: source.slice(index + 2, closingIndex) });
			index = closingIndex;
			continue;
		}

		if (char === "(") {
			flush();
			const closingIndex = findClosingParenthesis(source, index);
			if (closingIndex === -1) {
				malformed = true;
				break;
			}
			tokens.push({ kind: "nested", text: source.slice(index + 1, closingIndex) });
			index = closingIndex;
			continue;
		}

		if (char === ")") {
			flush();
			malformed = true;
			continue;
		}

		if (char === "&" && next === "&" || char === "|" && next === "|") {
			flush();
			tokens.push({ kind: "separator", text: `${char}${next}` });
			index += 1;
			continue;
		}

		if (char === "{") {
			flush();
			braceDepth += 1;
			tokens.push({ kind: "separator", text: char });
			continue;
		}

		if (char === "}") {
			flush();
			if (braceDepth === 0) malformed = true;
			else braceDepth -= 1;
			tokens.push({ kind: "separator", text: char });
			continue;
		}

		if (char === ";" || char === "|" || char === "\n") {
			flush();
			tokens.push({ kind: "separator", text: char });
			continue;
		}

		if (char === "&" || char === "=") {
			flush();
			tokens.push({ kind: "operator", text: char });
			continue;
		}

		if (/\s/.test(char)) {
			flush();
			continue;
		}

		current += char;
	}

	flush();
	if (braceDepth !== 0) malformed = true;
	return { tokens, malformed };
}

function segmentCommandStart(tokens: PowerShellLexToken[]): { index: number; dynamic: boolean } | undefined {
	let index = 0;
	while (tokens[index]?.kind === "word" && ["try", "finally", "catch", "begin", "process", "end", "else"].includes(tokens[index].text.toLowerCase())) {
		index += 1;
	}

	let assignment = false;
	for (let candidate = index; candidate < tokens.length; candidate += 1) {
		if (tokens[candidate]?.kind === "operator" && tokens[candidate].text === "=") {
			index = candidate + 1;
			assignment = true;
		}
	}

	let usedCallOperator = false;
	while (
		tokens[index] &&
		((tokens[index].kind === "operator" && tokens[index].text === "&") ||
			(tokens[index].kind === "word" && tokens[index].text === "."))
	) {
		usedCallOperator = true;
		index += 1;
	}

	const head = tokens[index];
	if (!head) return undefined;
	if (head.kind === "nested") return usedCallOperator ? { index, dynamic: true } : undefined;
	if (head.kind !== "word" && head.kind !== "string") return undefined;
	if (head.kind === "string") return usedCallOperator ? { index, dynamic: head.dynamic === true } : undefined;
	if (/^(?:\$|@|\[|\d)/.test(head.text)) return usedCallOperator ? { index, dynamic: true } : undefined;
	if (assignment && head.text === "{") return undefined;
	return { index, dynamic: false };
}

function hasNativeRecursiveForceFlags(tokens: PowerShellLexToken[], startIndex: number): boolean {
	let sawRecursive = false;
	let sawForce = false;
	for (const token of tokens.slice(startIndex + 1)) {
		if (token.kind !== "word") continue;
		if (token.text === "--") break;
		if (/^--recursive$/i.test(token.text)) sawRecursive = true;
		if (/^--force$/i.test(token.text)) sawForce = true;
		if (/^-[^-]+$/.test(token.text)) {
			const flags = token.text.slice(1);
			if (/[rR]/.test(flags)) sawRecursive = true;
			if (/f/.test(flags)) sawForce = true;
		}
	}
	return sawRecursive && sawForce;
}

function analyzeRemoveInvocation(tokens: PowerShellLexToken[], startIndex: number): PowerShellSafetyAnalysis {
	let sawRecursive = false;
	let sawForce = false;
	let sawWhatIf = false;

	for (const token of tokens.slice(startIndex + 1)) {
		if (token.kind !== "word") continue;
		if (token.text.startsWith("@") && token.text.length > 1) {
			return risky("Remove-Item parameter splatting requires confirmation");
		}
		const parameter = parseLexicalParameter(token.text);
		if (!parameter) continue;
		if (isPotentiallyEnabledSwitch(parameter.name, parameter.value, "recurse")) sawRecursive = true;
		if (isPotentiallyEnabledSwitch(parameter.name, parameter.value, "force")) sawForce = true;
		if (isDefinitelyEnabledWhatIf(parameter.name, parameter.value)) sawWhatIf = true;
	}

	if (sawRecursive && sawForce && !sawWhatIf) {
		return risky("recursive forced Remove-Item invocation");
	}
	return safe;
}

function analyzeLexicalSegment(tokens: PowerShellLexToken[]): PowerShellSafetyAnalysis {
	if (tokens.length === 0) return safe;
	if (tokens.some(isDynamicMemberInvocationToken) || hasDangerousQuotedMemberInvocation(tokens)) {
		return risky("dynamic PowerShell script-block invocation requires confirmation");
	}

	const start = segmentCommandStart(tokens);
	if (!start) return safe;
	if (start.dynamic) return risky("dynamic PowerShell command invocation requires confirmation");

	const head = tokens[start.index];
	const commandName = powerShellCommandName(head.text);
	if (!commandName) {
		return risky("dynamic PowerShell command invocation requires confirmation");
	}
	if (dynamicPowerShellCommands.has(commandName) || shellPowerShellCommands.has(commandName)) {
		return risky(`nested or dynamic PowerShell execution through ${commandName}`);
	}
	if (commandResolutionPowerShellCommands.has(commandName)) {
		return risky(`PowerShell command-resolution mutation through ${commandName}`);
	}
	if (commandDefinitionPowerShellKeywords.has(commandName)) {
		return risky(`PowerShell command-resolution mutation through ${commandName} definition`);
	}
	if (
		providerMutationPowerShellCommands.has(commandName) &&
		(containsCommandProviderPath(tokens.slice(start.index + 1).map((token) => token.text)) ||
			hasDynamicLexicalArguments(tokens.slice(start.index + 1)))
	) {
		return risky(`PowerShell command-provider mutation through ${commandName}`);
	}
	if (
		commandName === "using" &&
		tokens.slice(start.index + 1).some((token) => token.text.toLowerCase() === "module")
	) {
		return risky("PowerShell module loading requires confirmation");
	}
	if (isPowerShellScriptCommand(commandName)) {
		return risky("nested PowerShell script invocation requires confirmation");
	}
	if (commandName === "sudo" || commandName === "sudo.exe") return risky("sudo invocation");

	if (powerShellRemoveCommands.has(commandName)) {
		const analysis = analyzeRemoveInvocation(tokens, start.index);
		if (analysis.risky) return analysis;
		if (commandName === "rm" && hasNativeRecursiveForceFlags(tokens, start.index)) {
			return risky("recursive forced rm invocation");
		}
	}

	if (commandName === "rm.exe" && hasNativeRecursiveForceFlags(tokens, start.index)) {
		return risky("recursive forced native rm invocation");
	}
	if (["chmod", "chmod.exe", "chown", "chown.exe"].includes(commandName)) {
		if (tokens.slice(start.index + 1).some((token) => token.kind === "word" && /777/.test(token.text))) {
			return risky(`${commandName} 777 invocation`);
		}
	}

	return safe;
}

export function analyzePowerShellLexically(command: string, depth = 0): PowerShellSafetyAnalysis {
	if (depth > MAX_LEXICAL_DEPTH) return risky("PowerShell safety analysis nesting limit exceeded");

	const lexed = tokenizePowerShell(command);
	if (lexed.malformed) return risky("malformed PowerShell syntax requires confirmation");

	for (const token of lexed.tokens) {
		const nestedSources = token.kind === "nested" ? [token.text] : token.nestedSources ?? [];
		for (const nestedSource of nestedSources) {
			const nested = analyzePowerShellLexically(nestedSource, depth + 1);
			if (nested.risky) return nested;
		}
	}

	let segment: PowerShellLexToken[] = [];
	for (const token of lexed.tokens) {
		if (token.kind === "separator") {
			const analysis = analyzeLexicalSegment(segment);
			if (analysis.risky) return analysis;
			segment = [];
			continue;
		}
		segment.push(token);
	}

	return analyzeLexicalSegment(segment);
}

function parseAstElement(value: unknown): PowerShellAstElement | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.type !== "string" || typeof value.text !== "string" || typeof value.splatted !== "boolean") {
		return undefined;
	}
	if (value.parameter !== null && typeof value.parameter !== "string") return undefined;
	if (value.argument !== null && typeof value.argument !== "string") return undefined;
	return {
		type: value.type,
		text: value.text,
		parameter: value.parameter,
		argument: value.argument,
		splatted: value.splatted,
	};
}

function parseAstCommand(value: unknown): PowerShellAstCommand | undefined {
	if (!isRecord(value) || !Array.isArray(value.elements) || typeof value.invocationOperator !== "string") return undefined;
	if (value.name !== null && typeof value.name !== "string") return undefined;
	const elements = value.elements.map(parseAstElement);
	if (elements.length === 0 || elements.some((element) => !element)) return undefined;
	return {
		name: value.name,
		invocationOperator: value.invocationOperator,
		elements: elements as PowerShellAstElement[],
	};
}

function analyzeAstRemoveInvocation(command: PowerShellAstCommand): PowerShellSafetyAnalysis {
	let sawRecursive = false;
	let sawForce = false;
	let sawWhatIf = false;

	for (const element of command.elements.slice(1)) {
		if (element.splatted) return risky("Remove-Item parameter splatting requires confirmation");
		if (element.type !== "CommandParameterAst" || element.parameter === null) continue;
		if (isPotentiallyEnabledSwitch(element.parameter, element.argument, "recurse")) sawRecursive = true;
		if (isPotentiallyEnabledSwitch(element.parameter, element.argument, "force")) sawForce = true;
		if (isDefinitelyEnabledWhatIf(element.parameter, element.argument)) sawWhatIf = true;
	}

	if (sawRecursive && sawForce && !sawWhatIf) {
		return risky("recursive forced Remove-Item invocation");
	}
	return safe;
}

function analyzeAstCommand(command: PowerShellAstCommand): PowerShellSafetyAnalysis {
	if (!command.name) return risky("dynamic PowerShell command invocation requires confirmation");
	const commandName = powerShellCommandName(command.name);
	if (dynamicPowerShellCommands.has(commandName) || shellPowerShellCommands.has(commandName)) {
		return risky(`nested or dynamic PowerShell execution through ${commandName}`);
	}
	if (commandResolutionPowerShellCommands.has(commandName)) {
		return risky(`PowerShell command-resolution mutation through ${commandName}`);
	}
	if (
		providerMutationPowerShellCommands.has(commandName) &&
		(containsCommandProviderPath(command.elements.slice(1).map((element) => element.text)) ||
			hasDynamicAstArguments(command.elements.slice(1)))
	) {
		return risky(`PowerShell command-provider mutation through ${commandName}`);
	}
	if (isPowerShellScriptCommand(commandName)) {
		return risky("nested PowerShell script invocation requires confirmation");
	}
	if (commandName === "sudo" || commandName === "sudo.exe") return risky("sudo invocation");

	if (powerShellRemoveCommands.has(commandName)) {
		const removeAnalysis = analyzeAstRemoveInvocation(command);
		if (removeAnalysis.risky) return removeAnalysis;
		const tokens = command.elements.map((element) => ({ kind: "word" as const, text: element.text }));
		if (commandName === "rm" && hasNativeRecursiveForceFlags(tokens, 0)) {
			return risky("recursive forced rm invocation");
		}
	}

	if (commandName === "rm.exe") {
		const tokens = command.elements.map((element) => ({ kind: "word" as const, text: element.text }));
		if (hasNativeRecursiveForceFlags(tokens, 0)) return risky("recursive forced native rm invocation");
	}

	if (["chmod", "chmod.exe", "chown", "chown.exe"].includes(commandName)) {
		if (command.elements.slice(1).some((element) => /777/.test(element.text))) {
			return risky(`${commandName} 777 invocation`);
		}
	}

	return safe;
}

export function analyzePowerShellAstPayload(payload: unknown): PowerShellSafetyAnalysis {
	if (!isRecord(payload)) return risky("malformed PowerShell AST analyzer response");
	if (Object.hasOwn(payload, "analyzerError")) {
		return typeof payload.analyzerError === "string"
			? risky(`PowerShell AST analyzer failed: ${payload.analyzerError}`)
			: risky("malformed PowerShell AST analyzer response");
	}
	if (
		!Array.isArray(payload.parseErrors) ||
		!Array.isArray(payload.commands) ||
		!Number.isSafeInteger(payload.dynamicInvocationCount) ||
		(payload.dynamicInvocationCount as number) < 0 ||
		!Number.isSafeInteger(payload.functionDefinitionCount) ||
		(payload.functionDefinitionCount as number) < 0
	) {
		return risky("malformed PowerShell AST analyzer response");
	}
	if (payload.parseErrors.some((error) => typeof error !== "string")) {
		return risky("malformed PowerShell AST parser errors");
	}
	if (payload.parseErrors.length > 0) return risky("PowerShell parser reported invalid syntax");
	if ((payload.dynamicInvocationCount as number) > 0) {
		return risky("dynamic PowerShell invocation requires confirmation");
	}
	if ((payload.functionDefinitionCount as number) > 0) {
		return risky("PowerShell function or filter definition changes command resolution");
	}

	const commands = payload.commands.map(parseAstCommand);
	if (commands.some((command) => !command)) return risky("malformed PowerShell AST command metadata");
	for (const command of commands as PowerShellAstCommand[]) {
		const analysis = analyzeAstCommand(command);
		if (analysis.risky) return analysis;
	}
	return safe;
}

export function parsePowerShellAstOutput(stdout: string): PowerShellSafetyAnalysis {
	const markerLine = stdout
		.split(/\r?\n/)
		.reverse()
		.find((line) => line.startsWith(POWERSHELL_AST_MARKER));
	if (!markerLine) return risky("PowerShell AST analyzer produced no result");
	try {
		return analyzePowerShellAstPayload(JSON.parse(markerLine.slice(POWERSHELL_AST_MARKER.length)));
	} catch {
		return risky("PowerShell AST analyzer produced invalid JSON");
	}
}
