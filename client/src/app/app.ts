import { Component, signal } from '@angular/core';
import { ApartmentViewer, RoomView } from './apartment-viewer/apartment-viewer';

@Component({
  selector: 'app-root',
  imports: [ApartmentViewer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('Apartment Model');

  /** Optimized model served statically from /public. */
  protected readonly modelUrl = 'apartment.glb';

  /**
   * Room viewpoints shown as buttons in orbit mode.
   *
   * To capture these: run the app, switch to Orbit, frame a room nicely,
   * then press "P". The console prints a RoomView line you can paste here,
   * replacing the placeholders below.
   */
  protected readonly rooms: RoomView[] = [
    { label: 'Kitchen', position: [2.77, 1.31, -2.99], target: [2.22, 1.13, -3.81] },
    { label: 'Living Room', position: [0.89, 1.31, -3.22], target: [1.48, 1.01, -2.47] },
    { label: 'Kitchen / Living', position: [2.70, 1.31, -0.59], target: [2.34, 1.16, -1.51] },
    { label: 'Large Bedroom', position: [6.65, 1.31, -0.35], target: [5.97, 1.12, -1.06] },
    { label: 'Storage', position: [6.65, 1.31, -5.76], target: [5.87, 1.03, -5.20] },
    { label: 'Hallway', position: [3.85, 1.31, -9.07], target: [4.12, 1.18, -8.11] },
    { label: 'Bathroom', position: [5.39, 1.37, -6.69], target: [5.88, 1.00, -7.48] },
    { label: 'Guest / Office', position: [3.15, 1.31, -7.15], target: [2.26, 1.09, -7.55] },
    { label: 'Balcony', position: [-1.23, 1.30, -3.92], target: [-0.63, 1.16, -4.71] },
    { label: 'Entrance', position: [6.10, 1.31, -9.05], target: [5.13, 1.11, -8.90] },
  ];
}
