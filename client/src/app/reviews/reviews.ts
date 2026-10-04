import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Review, ReviewsService } from './reviews.service';

@Component({
  selector: 'app-reviews',
  imports: [FormsModule],
  templateUrl: './reviews.html',
  styleUrl: './reviews.css',
})
export class Reviews implements OnInit {
  private readonly service = inject(ReviewsService);
  private readonly token = this.service.getAuthorToken();

  protected readonly reviews = signal<Review[]>([]);
  protected readonly average = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);

  // Form state
  protected readonly rating = signal(0);
  protected readonly hoverRating = signal(0);
  protected comment = '';

  protected readonly stars = [1, 2, 3, 4, 5];

  /** The current browser's own review, if any. */
  protected readonly myReview = computed(() =>
    this.reviews().find((r) => r.author_token === this.token) ?? null,
  );

  /** Reviews from everyone else, for the public list. */
  protected readonly otherReviews = computed(() =>
    this.reviews().filter((r) => r.author_token !== this.token),
  );

  ngOnInit(): void {
    this.load();
  }

  protected setRating(value: number): void {
    this.rating.set(value);
  }

  protected displayStar(index: number): boolean {
    const active = this.hoverRating() || this.rating();
    return index <= active;
  }

  protected submit(): void {
    if (this.rating() < 1) {
      this.error.set('Please pick a star rating.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.service.submit(this.rating(), this.comment.trim()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.load();
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('Could not submit your review. Please try again.');
      },
    });
  }

  protected editMine(): void {
    const mine = this.myReview();
    if (mine) {
      this.rating.set(mine.rating);
      this.comment = mine.comment;
    }
  }

  protected deleteMine(): void {
    this.submitting.set(true);
    this.service.remove().subscribe({
      next: () => {
        this.submitting.set(false);
        this.rating.set(0);
        this.comment = '';
        this.load();
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('Could not delete your review.');
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.reviews.set(res.reviews);
        this.average.set(res.average);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load reviews.');
      },
    });
  }
}
