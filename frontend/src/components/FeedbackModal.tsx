import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'usability', label: 'Hard to use' },
  { value: 'idea', label: 'An idea or request' },
  { value: 'other', label: 'Something else' },
];

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Consent based product feedback. Nothing is sent until the person confirms
 * that the message may be stored, and no account is required.
 */
export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { request, loading } = useApi();
  const { addToast } = useToast();

  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState('other');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setRating(0);
    setCategory('other');
    setMessage('');
    setContact('');
    setConsent(false);
    setSubmitted(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!consent) {
      addToast({ message: 'Please confirm consent before sending feedback.', type: 'error' });
      return;
    }
    if (rating < 1) {
      addToast({ message: 'Please choose a rating.', type: 'error' });
      return;
    }
    if (message.trim().length < 3) {
      addToast({ message: 'Please tell us a little more.', type: 'error' });
      return;
    }

    const result = await request<{ id: string; received: boolean }>('POST', '/api/feedback', {
      rating,
      category,
      message: message.trim(),
      contact: contact.trim() || undefined,
      consent: true,
    });

    if (result?.received) {
      setSubmitted(true);
      addToast({ message: 'Thank you. Your feedback was received.', type: 'success' });
      return;
    }

    addToast({
      message: 'We could not send your feedback. Please try again.',
      type: 'error',
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Send feedback" size="md">
      {submitted ? (
        <div className="space-y-4 text-center py-4">
          <p className="text-sm text-gray-700">
            Thank you. Your feedback helps us improve Campaign-DP for campaign teams and
            supporters.
          </p>
          <Button onClick={close} className="w-full">
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">
              How is Campaign-DP working for you?
            </legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-pressed={rating === value}
                  aria-label={RATING_LABELS[value - 1]}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm transition ${
                    rating === value
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="feedback-category" className="block text-sm font-medium text-gray-700 mb-1">
              What is this about?
            </label>
            <select
              id="feedback-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="feedback-message" className="block text-sm font-medium text-gray-700 mb-1">
              Your message
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Tell us what happened or what would help."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="feedback-contact" className="block text-sm font-medium text-gray-700 mb-1">
              Email or phone (optional)
            </label>
            <input
              id="feedback-contact"
              type="text"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={200}
              placeholder="Only if you would like a reply"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
            />
            <span>
              I agree that this message may be stored and used to improve the product. Do not
              include sensitive personal information.
            </span>
          </label>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={close} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Sending...' : 'Send feedback'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
