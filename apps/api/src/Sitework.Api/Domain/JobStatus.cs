namespace Sitework.Api.Domain;

public enum JobStatus
{
    Draft,
    Scheduled,
    InProgress,
    OnHold,
    Completed,
    Cancelled,
}

public enum JobPriority
{
    Low,
    Normal,
    High,
    Urgent,
}
