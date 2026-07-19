import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type {
  VocabularyCard,
  VocabularyRating,
} from '@shared/vocabulary/contracts';

type Direction = 'left' | 'right' | 'up' | 'down';

const directionRatings: Record<Direction, VocabularyRating> = {
  right: 'mastered',
  up: 'mostly_known',
  down: 'mostly_unknown',
  left: 'unknown',
};

export function SwipeVocabularyCard({
  card,
  disabled,
  onClassify,
}: {
  card: VocabularyCard;
  disabled?: boolean;
  onClassify: (rating: VocabularyRating) => void;
}) {
  const start = useRef({ x: 0, y: 0 });
  const activePointer = useRef<number | null>(null);
  const moved = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [meaningVisible, setMeaningVisible] = useState(false);
  const direction = getDirection(offset.x, offset.y);
  const strength = Math.min(
    1,
    Math.max(Math.abs(offset.x), Math.abs(offset.y)) / 115,
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || isExiting) return;
    activePointer.current = event.pointerId;
    start.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (activePointer.current !== event.pointerId || isExiting) return;
    event.preventDefault();
    const x = event.clientX - start.current.x;
    const y = event.clientY - start.current.y;
    if (Math.hypot(x, y) > 7) moved.current = true;
    setOffset({ x, y });
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (activePointer.current !== event.pointerId || isExiting) return;
    activePointer.current = null;
    setIsDragging(false);
    const threshold = Math.min(96, event.currentTarget.clientWidth * 0.23);
    const currentDirection = getDirection(offset.x, offset.y);
    const distance =
      currentDirection === 'left' || currentDirection === 'right'
        ? Math.abs(offset.x)
        : Math.abs(offset.y);
    if (moved.current && distance >= threshold) {
      commit(currentDirection);
      return;
    }
    if (!moved.current) setMeaningVisible((current) => !current);
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerCancel() {
    activePointer.current = null;
    setIsDragging(false);
    setOffset({ x: 0, y: 0 });
  }

  function commit(committedDirection: Direction) {
    setIsExiting(true);
    const horizontal =
      committedDirection === 'left'
        ? -window.innerWidth * 1.25
        : committedDirection === 'right'
          ? window.innerWidth * 1.25
          : offset.x * 2;
    const vertical =
      committedDirection === 'up'
        ? -window.innerHeight * 1.15
        : committedDirection === 'down'
          ? window.innerHeight * 1.15
          : offset.y * 2;
    setOffset({ x: horizontal, y: vertical });
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    window.setTimeout(
      () => onClassify(directionRatings[committedDirection]),
      reducedMotion ? 0 : 210,
    );
  }

  const rotation = Math.max(-9, Math.min(9, offset.x / 22));
  return (
    <div className="swipe-card-stage">
      <DirectionCue
        active={direction === 'up'}
        direction="up"
        label="どちらかといえば覚えている"
        strength={strength}
      />
      <DirectionCue
        active={direction === 'left'}
        direction="left"
        label="まったく分からない"
        strength={strength}
      />
      <DirectionCue
        active={direction === 'right'}
        direction="right"
        label="完璧に知っている"
        strength={strength}
      />
      <DirectionCue
        active={direction === 'down'}
        direction="down"
        label="どちらかといえば覚えていない"
        strength={strength}
      />

      <div
        className="swipe-card-shadow swipe-card-shadow-back"
        aria-hidden="true"
      />
      <div
        className="swipe-card-shadow swipe-card-shadow-front"
        aria-hidden="true"
      />
      <div
        aria-label={`${card.term}。タップで日本語訳を表示、4方向へスワイプして分類します。`}
        className={`swipe-vocabulary-card${isDragging ? ' is-dragging' : ''}${isExiting ? ' is-exiting' : ''}${meaningVisible ? ' meaning-visible' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setMeaningVisible((current) => !current);
          }
        }}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        role="button"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg)`,
        }}
        tabIndex={0}
      >
        <div className="swipe-card-paper-line" aria-hidden="true" />
        <p className="swipe-card-kind">
          {card.kind === 'word' ? 'WORD' : 'IDIOM'}
        </p>
        <div className="swipe-card-content">
          <p className="swipe-card-term">{card.term}</p>
          <div className="swipe-card-divider" aria-hidden="true">
            <i />
            <span>{meaningVisible ? '日本語訳' : 'TAP TO REVEAL'}</span>
            <i />
          </div>
          <p aria-hidden={!meaningVisible} className="swipe-card-meaning">
            {meaningVisible ? card.meaningJa : 'カードをタップして意味を確認'}
          </p>
        </div>
        <p className="swipe-card-note">SWIPE IN FOUR DIRECTIONS</p>
      </div>
    </div>
  );
}

function DirectionCue({
  direction,
  label,
  active,
  strength,
}: {
  direction: Direction;
  label: string;
  active: boolean;
  strength: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`swipe-direction-cue cue-${direction}${active ? ' active' : ''}`}
      style={{ '--cue-strength': active ? strength : 0 } as CSSProperties}
    >
      <span>{directionArrow(direction)}</span>
      <small>{label}</small>
    </div>
  );
}

function getDirection(x: number, y: number): Direction {
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

function directionArrow(direction: Direction) {
  if (direction === 'left') return '←';
  if (direction === 'right') return '→';
  if (direction === 'up') return '↑';
  return '↓';
}
