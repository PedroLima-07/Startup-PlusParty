import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Local } from './local';

describe('Local', () => {
  let component: Local;
  let fixture: ComponentFixture<Local>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Local]
    })
      .compileComponents();

    fixture = TestBed.createComponent(Local);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
