namespace Sitework.Api.Domain;

public enum DomainErrorKind
{
    /// <summary>The request is well-formed but breaks a rule given the job's current state (409).</summary>
    Conflict,

    /// <summary>A required value is missing for this operation (400, attached to <see cref="DomainError.Field"/>).</summary>
    Validation,
}

/// <param name="Code">Stable, machine-readable reason the UI can branch on.</param>
public sealed record DomainError(DomainErrorKind Kind, string Code, string Title, string Detail, string? Field = null)
{
    public static DomainError Conflict(string code, string title, string detail) =>
        new(DomainErrorKind.Conflict, code, title, detail);

    public static DomainError Invalid(string field, string detail) =>
        new(DomainErrorKind.Validation, "validation_failed", "One or more validation errors occurred.", detail, field);
}
