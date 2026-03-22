import stringWidth from 'string-width';

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function getGraphemes(value: string): string[] {
  if (!segmenter) {
    return Array.from(value);
  }

  return Array.from(segmenter.segment(value), ({ segment }) => segment);
}

export function measureTextWidth(value: string): number {
  return stringWidth(value);
}

export function padEndToWidth(value: string, width: number): string {
  const padding = Math.max(width - measureTextWidth(value), 0);
  return value + ' '.repeat(padding);
}

export function padStartToWidth(value: string, width: number): string {
  const padding = Math.max(width - measureTextWidth(value), 0);
  return ' '.repeat(padding) + value;
}

export function truncateToWidth(value: string, width: number): string {
  if (!value || width <= 0) {
    return '';
  }

  if (measureTextWidth(value) <= width) {
    return value;
  }

  const ellipsis = '…';
  const ellipsisWidth = measureTextWidth(ellipsis);
  if (width <= ellipsisWidth) {
    return ellipsis;
  }

  let output = '';
  let currentWidth = 0;
  const targetWidth = width - ellipsisWidth;

  for (const grapheme of getGraphemes(value)) {
    const graphemeWidth = measureTextWidth(grapheme);
    if (currentWidth + graphemeWidth > targetWidth) {
      break;
    }
    output += grapheme;
    currentWidth += graphemeWidth;
  }

  return output + ellipsis;
}
