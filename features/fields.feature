Feature: Species diffuse and decay in the body
  Reaction–diffusion on the tet mesh, P1 finite elements with lumped mass, backward Euler.
  Nodal amounts are conserved, so growth dilutes concentrations (from regrow, model spec §2, E1).

  Scenario: A source-sink gradient decays with length sqrt(D/k)
    Given a long bar
    When a species is held at one end and reaches steady state
    Then the concentration decays exponentially with length sqrt(D/k) within 5 percent

  Scenario: Diffusion without decay conserves the total amount
    Given a long bar with a pulse of a species at one end
    When it diffuses for many steps without decay
    Then the total amount is unchanged
    And the concentration has spread toward uniform

  Scenario: Time stepping converges to the steady state
    Given a long bar
    When a species held at one end is stepped for a long time
    Then it matches the steady-state solution

  Scenario: Growth dilutes a species without creating or destroying it
    Given a long bar with a uniform species
    When the bar grows uniformly to 1.5 times its volume
    Then the total amount is unchanged
    And the concentration has fallen by a factor 1.5
