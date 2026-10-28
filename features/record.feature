Feature: Record a run and replay it
  A run is kept as frames of a sample the app defines, at a fixed interval of model time. The
  playhead can scrub back over the record, and a seeded run replays bit for bit.

  Scenario: Frames are kept at each multiple of the interval
    Given a recorder with an interval of 15
    When time advances from 0 to 50 in steps of 4
    Then it holds frames at 0, 15, 30 and 45

  Scenario: Scrubbing interpolates between frames
    Given a recorder with an interval of 10 that interpolates numbers
    When it records the values 0 and 10 at times 0 and 10
    Then the value at time 2.5 is 2.5
    And a time past the end gives the last frame and a time before the start gives the first

  Scenario: Without interpolation the frame at or before the time is shown
    Given a recorder with an interval of 10 that does not interpolate
    When it records the values 0 and 10 at times 0 and 10
    Then the value at time 7 is 0

  Scenario: A seeded generator replays exactly
    Given two generators with seed 42 and one with seed 43
    Then the first two give the same thousand numbers, all in 0 to 1
    And the third differs
