import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionCard } from './QuestionCard.tsx';

globalThis.React = React;

const question = {
  id: 'q-5',
  category: 'vocabulary',
  stem: 'Choose the best answer.',
  options: [
    { id: 'A', text: 'alpha' },
    { id: 'B', text: 'bravo' },
    { id: 'C', text: 'charlie' },
    { id: 'D', text: 'delta' },
  ],
};

test('renders touch-safe buttons instead of native radio labels', () => {
  const markup = renderQuestion({ kind: 'option', optionId: 'C' });

  assert.equal(markup.includes('<input'), false);
  assert.equal(markup.includes('type="radio"'), false);
  assert.equal((markup.match(/type="button"/g) ?? []).length, 5);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(markup, /aria-pressed="true"[^>]*>.*?>C</s);
});

test('renders every choice unselected for a new unanswered question', () => {
  const markup = renderQuestion(null);

  assert.equal(markup.includes('aria-pressed="true"'), false);
  assert.equal((markup.match(/aria-pressed="false"/g) ?? []).length, 5);
  assert.equal(markup.includes('answer-option-selected'), false);
});

function renderQuestion(answer) {
  return renderToStaticMarkup(
    createElement(QuestionCard, {
      answer,
      disabled: false,
      onAnswer: () => undefined,
      question,
    }),
  );
}
