Feature: The soft regime does not depend on the substep count
  For tissue-scale bodies the compliance term of every constraint dominates the particles'
  inertia, so the shape a body is pulled into does not depend on how many substeps are used
  (from Close the Wound, src/soft/solver.ts).

  Scenario Outline: A held, pulled bar settles to the same length
    Given a bar held at one end
    When its free end is pulled with a constant force and it settles with <substeps> substeps
    Then its length is within 1 percent of the length reached with 8 substeps

    Examples:
      | substeps |
      | 2        |
      | 4        |

  Scenario: Held particles do not move
    Given a bar held at one end
    When its free end is pulled with a constant force and it settles with 4 substeps
    Then the held particles are where they started
