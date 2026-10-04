import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Review {
  id: number;
  rating: number;
  comment: string;
  author_token: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  count: number;
  average: number;
}

const TOKEN_KEY = 'apartment_review_token';

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  /**
   * Returns this browser's anonymous author token, creating and persisting
   * one in localStorage on first use. Not personal data: a random UUID.
   */
  getAuthorToken(): string {
    let token = this.readToken();
    if (!token) {
      token = this.generateUuid();
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        // localStorage unavailable (private mode, etc.) — token is session-only.
      }
    }
    return token;
  }

  list(): Observable<ReviewsResponse> {
    return this.http.get<ReviewsResponse>(`${this.base}/reviews`);
  }

  submit(rating: number, comment: string): Observable<{ review: Review }> {
    return this.http.post<{ review: Review }>(`${this.base}/reviews`, {
      rating,
      comment,
      authorToken: this.getAuthorToken(),
    });
  }

  remove(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/reviews-delete`, {
      authorToken: this.getAuthorToken(),
    });
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private generateUuid(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    // Fallback UUID v4.
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
      const n = Number(c);
      return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
    });
  }
}
