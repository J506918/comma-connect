import { describe, it, expect } from 'vitest';

// Replicate the cleanAnsiText function from terminal.tsx
function cleanAnsiText(text: string): string {
  return text
    // Remove ANSI escape sequences (colors, cursor movement, etc.)
    .replace(/\x1b\[[^m]*m/g, '')
    .replace(/\x1b\[\?[0-9]+[a-zA-Z]/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove other control characters except newline/carriage return
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
    .trim();
}

describe('ANSI Text Cleaning', () => {
  it('should remove ANSI color codes', () => {
    const input = '\x1b[31mError\x1b[0m';
    const output = cleanAnsiText(input);
    expect(output).toBe('Error');
  });

  it('should remove cursor movement sequences', () => {
    const input = 'Hello\x1b[?2004hWorld';
    const output = cleanAnsiText(input);
    expect(output).toBe('HelloWorld');
  });

  it('should preserve normal text', () => {
    const input = 'Normal text without ANSI';
    const output = cleanAnsiText(input);
    expect(output).toBe('Normal text without ANSI');
  });

  it('should remove control characters', () => {
    const input = 'Text\x00with\x01control\x1fchars';
    const output = cleanAnsiText(input);
    expect(output).toBe('Textwithcontrolchars');
  });

  it('should handle empty strings', () => {
    const input = '';
    const output = cleanAnsiText(input);
    expect(output).toBe('');
  });
});
