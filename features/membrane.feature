Feature: A thin sheet behaves as a membrane
  An alveolar septum is about 12 micrometres across a 100 micrometre alveolus, so it is a
  membrane, not a solid. The mesh is the surface itself: edges resist stretch, pairs across an
  edge resist folding, and a cavity constraint holds the volume inside.

  Scenario: A closed membrane left alone keeps its shape
    Given a spherical membrane holding its own volume
    When one second is simulated
    Then the volume is within 1 percent of where it started
    And the area is within 1 percent of where it started

  Scenario: Inflating a membrane stretches it
    Given a spherical membrane holding its own volume
    When its target volume is raised by 20 percent and it settles
    Then the volume is within 1 percent of the target
    And the area has grown
    And the cavity pressure is positive

  Scenario Outline: What it settles to does not depend on the substeps
    Given a spherical membrane holding its own volume
    When its target volume is raised by 20 percent and it settles with <substeps> substeps
    Then the area is within 1 percent of the area reached with 16 substeps

    Examples:
      | substeps |
      | 4        |
      | 8        |

  Scenario: Rolling a sheet is resisted, gently
    Given a flat sheet held along one edge and rolled onto a cylinder
    When it is released and settles
    Then a sheet with no fold resistance stays exactly where it was put, the roll being isometric
    And more fold resistance brings it back closer to flat
    And even a very stiff sheet returns only part of the way, the resistance being second order

  Scenario: A deflated bubble keeps a sane shape
    Given a spherical membrane holding its own volume
    When its target volume is lowered to 60 percent and it settles
    Then the volume is within 2 percent of the target
    And no triangle has turned inside out
    And the area has not grown

  Scenario: Held nodes do not move
    Given a spherical membrane with its lower half held
    When its target volume is raised by 20 percent and it settles
    Then the held nodes are exactly where they started
    And the free nodes have moved
