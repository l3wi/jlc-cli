import React from 'react';
import { Text } from 'ink';

interface DividerProps {
  width: number;
}

export function Divider({ width }: DividerProps) {
  return <Text dimColor>{'─'.repeat(Math.max(width - 2, 10))}</Text>;
}
