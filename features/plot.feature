Feature: A small plot of series over time
  One canvas plot serves every app: live readouts, earlier runs drawn faint behind the current
  one, a dashed second trace, and marks where the conditions changed.

  Scenario: Ticks fall on round numbers inside the range
    When ticks are chosen for 0 to 47 with at most 6
    Then they are 0, 10, 20, 30 and 40
    When ticks are chosen for 0.2 to 0.9 with at most 5
    Then they step by 0.2 and lie within the range

  Scenario: Bounds cover every series, and a flat series still has a span
    Given two series, one from 0 to 10 minutes and one flat at 0.5
    Then the bounds run from 0 to 10 in x and enclose 0.5 in y with a non-zero height

  Scenario: Data maps to pixels with y pointing up
    Given axes from 0 to 10 and 0 to 1 on a 200 by 100 box with a margin of 10
    Then the point (0, 0) is at the bottom left inside the margin
    And the point (10, 1) is at the top right inside the margin

  Scenario: Drawing touches the canvas once per visible series and once per mark
    Given a recording canvas
    When two series, one of them faint and one empty, and one mark are drawn
    Then one path is stroked per non-empty series and one per mark
