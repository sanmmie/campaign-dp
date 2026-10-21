import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FeedbackModal } from './FeedbackModal';

/**
 * Feedback is only stored with explicit consent, so the form must never send
 * a request before the person confirms it.
 */

const mockRequest = vi.fn();
const mockAddToast = vi.fn();

vi.mock('../hooks/useApi', () => ({
  useApi: () => ({ request: mockRequest, loading: false }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

beforeEach(() => {
  mockRequest.mockReset();
  mockAddToast.mockReset();
  mockRequest.mockResolvedValue({ id: 'fb-1', received: true });
});

function renderModal() {
  return render(<FeedbackModal isOpen onClose={() => {}} />);
}

describe('Phase 10 — feedback consent', () => {
  it('does not send feedback before consent is confirmed', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: RATING_LABELS[3 - 1] }));
    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'The download button is slow.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  it('does not send feedback without a rating', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'The download button is slow.' },
    });
    fireEvent.click(screen.getByLabelText(/I agree that this message/));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does not send feedback without a message', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: RATING_LABELS[4 - 1] }));
    fireEvent.click(screen.getByLabelText(/I agree that this message/));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends the feedback with consent once both are provided', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: RATING_LABELS[5 - 1] }));
    fireEvent.change(screen.getByLabelText('What is this about?'), {
      target: { value: 'idea' },
    });
    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'Please add a WhatsApp status format.' },
    });
    fireEvent.click(screen.getByLabelText(/I agree that this message/));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    const [method, endpoint, payload] = mockRequest.mock.calls[0]!;
    expect(method).toBe('POST');
    expect(endpoint).toBe('/api/feedback');
    expect(payload).toEqual({
      rating: 5,
      category: 'idea',
      message: 'Please add a WhatsApp status format.',
      contact: undefined,
      consent: true,
    });
  });

  it('confirms receipt after a successful submission', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: RATING_LABELS[3 - 1] }));
    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'Works well on my phone.' },
    });
    fireEvent.click(screen.getByLabelText(/I agree that this message/));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => {
      expect(screen.getByText(/Thank you/)).toBeTruthy();
    });
  });

  it('reports a failure instead of claiming success', async () => {
    mockRequest.mockResolvedValue(null);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: RATING_LABELS[2 - 1] }));
    fireEvent.change(screen.getByLabelText('Your message'), {
      target: { value: 'Something went wrong on my phone.' },
    });
    fireEvent.click(screen.getByLabelText(/I agree that this message/));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      );
    });
    expect(screen.queryByText(/Thank you/)).toBeNull();
  });
});
