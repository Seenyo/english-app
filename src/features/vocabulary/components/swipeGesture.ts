export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

const minimumDistance = 112;
const maximumDistance = 150;
const widthRatio = 0.34;
const axisDominanceRatio = 1.35;

export function getSwipeDirection(x: number, y: number): SwipeDirection {
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

export function getCommittedSwipeDirection(
  x: number,
  y: number,
  cardWidth: number,
): SwipeDirection | null {
  const horizontalDistance = Math.abs(x);
  const verticalDistance = Math.abs(y);
  const threshold = Math.min(
    maximumDistance,
    Math.max(minimumDistance, cardWidth * widthRatio),
  );

  if (
    horizontalDistance >= threshold &&
    horizontalDistance >= verticalDistance * axisDominanceRatio
  ) {
    return x < 0 ? 'left' : 'right';
  }
  if (
    verticalDistance >= threshold &&
    verticalDistance >= horizontalDistance * axisDominanceRatio
  ) {
    return y < 0 ? 'up' : 'down';
  }
  return null;
}
