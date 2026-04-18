/**
 * AI Service — uses Manus built-in LLM via server (no external API key needed)
 * 
 * SECURITY BOUNDARY:
 * - AI can ONLY operate on comma device via SSH commands
 * - AI has NO access to phone local filesystem
 * - All file operations must go through sshService
 * - Calls go through server-side LLM wrapper for proper authentication
 */

import { getApiBaseUrl } from '@/constants/oauth';

// Use server-side LLM wrapper (authenticated via server)
function getAiApiUrl(): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/trpc/llm.invoke`;
}

export interface AIAnalysisResult {
  summary: string;
  rootCause?: string;
  suggestions: string[];
  fixCommands?: string[];
}

export interface AICanAnalysisResult {
  signals: Array<{
    id: string;
    description: string;
    unit?: string;
    values?: string;
  }>;
  summary: string;
}

async function callAI(
  prompt: string,
  systemPrompt: string,
  apiKey?: string
): Promise<string> {
  // Use server-side LLM wrapper
  try {
    const apiUrl = getAiApiUrl();
    console.log('Calling server LLM service at:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`LLM API error ${response.status}:`, error);
      
      // Check if it's an API key error
      if (error.includes('OPENAI_API_KEY') || error.includes('not configured')) {
        throw new Error('AI 服务未配置：请设置 API 密钥');
      }
      
      throw new Error(`AI 服务错误: ${response.status}`);
    }

    const data = await response.json();
    // tRPC returns result in data.result.data
    const result = data.result?.data;
    if (!result) {
      console.error('No result in LLM response:', data);
      throw new Error('AI 服务返回无结果');
    }
    
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      console.error('No content in LLM response:', result);
      throw new Error('AI 服务返回无内容');
    }

    return content;
  } catch (err: any) {
    console.error('LLM request failed:', err);
    throw new Error(`AI 服务错误: ${err.message}`);
  }
}

export async function analyzeLog(
  logContent: string,
  apiKey?: string
): Promise<AIAnalysisResult> {
  const systemPrompt = `You are an expert in comma.ai openpilot systems and Linux diagnostics.
Analyze the provided log and return a JSON response with this structure:
{
  "summary": "Brief description of what happened",
  "rootCause": "The root cause of the error",
  "suggestions": ["suggestion 1", "suggestion 2"],
  "fixCommands": ["command 1", "command 2"]
}
Only return valid JSON. Focus on actionable fixes.`;

  const prompt = `Analyze this log from a comma device:\n\n${logContent.slice(-8000)}`;

  try {
    const raw = await callAI(prompt, systemPrompt, apiKey);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      summary: raw,
      suggestions: [],
    };
  } catch (err: any) {
    return {
      summary: `AI 分析失败: ${err.message}`,
      suggestions: ['请检查 AI 服务配置'],
    };
  }
}

export async function analyzeCanData(
  messages: Array<{ id: string; data: string; dlc: number }>,
  apiKey?: string
): Promise<AICanAnalysisResult> {
  const systemPrompt = `You are an automotive CAN bus expert.
Analyze the provided CAN messages and identify known signals.
Return a JSON response:
{
  "signals": [
    {"id": "0x123", "description": "Engine RPM", "unit": "rpm", "values": "0-8000"},
    ...
  ],
  "summary": "Overall description of the captured data"
}
Only return valid JSON.`;

  const sample = messages.slice(0, 100);
  const prompt = `Analyze these CAN messages:\n${JSON.stringify(sample, null, 2)}`;

  try {
    const raw = await callAI(prompt, systemPrompt, apiKey);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { signals: [], summary: raw };
  } catch (err: any) {
    return { signals: [], summary: `AI 分析失败: ${err.message}` };
  }
}

export async function analyzeFileForErrors(
  filePath: string,
  fileContent: string,
  apiKey?: string
): Promise<AIAnalysisResult> {
  const systemPrompt = `You are an expert in openpilot and Python/C++ code.
Analyze the provided file for errors or issues.
Return a JSON response:
{
  "summary": "What issues were found",
  "rootCause": "Why the issue occurs",
  "suggestions": ["fix suggestion 1"],
  "fixCommands": ["sed command or patch to fix the issue"]
}
Only return valid JSON.`;

  const prompt = `File: ${filePath}\n\nContent:\n${fileContent.slice(0, 6000)}`;

  try {
    const raw = await callAI(prompt, systemPrompt, apiKey);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { summary: raw, suggestions: [] };
  } catch (err: any) {
    return { summary: `AI 分析失败: ${err.message}`, suggestions: ['请检查 AI 服务配置'] };
  }
}

export async function suggestCodeFix(
  filePath: string,
  fileContent: string,
  errorDescription: string,
  apiKey?: string
): Promise<{ fixedContent: string; explanation: string }> {
  const systemPrompt = `You are an expert in openpilot code.
Given a file and an error description, return the fixed file content.
Return a JSON response:
{
  "fixedContent": "the complete fixed file content",
  "explanation": "what was changed and why"
}
Only return valid JSON.`;

  const prompt = `File: ${filePath}\nError: ${errorDescription}\n\nOriginal content:\n${fileContent.slice(0, 5000)}`;

  try {
    const raw = await callAI(prompt, systemPrompt, apiKey);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { fixedContent: fileContent, explanation: raw };
  } catch (err: any) {
    return { fixedContent: fileContent, explanation: `AI 修复生成失败: ${err.message}` };
  }
}
