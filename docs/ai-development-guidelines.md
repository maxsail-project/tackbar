# AI Development Guidelines

This document defines the initial development principles for TackBar.

## Development philosophy

TackBar is currently a proof of concept.

The priority is to validate the product workflow before optimizing architecture or scalability.

Prefer:

- simple solutions;
- explicit code;
- small dependencies;
- testable components;
- incremental evolution.

Avoid premature abstraction.

## Architecture principles

The initial backend should keep the following responsibilities separated:

- email ingestion;
- attachment extraction;
- activity parsing;
- domain normalization;
- session matching;
- persistence;
- API layer.

External providers such as Mailgun or Gmail must remain adapters and must not define the TackBar domain model.

## Activity model

All input formats must eventually produce the same internal normalized `Activity`.

Initial sources may include:

- Vakaros CSV.GZ;
- Vakaros VKX;
- FIT;
- GPX;
- future APIs.

The analytics and session matching layers should not need to know where the activity originated.

## Testing

Use real sailing files as fixtures whenever possible.

Initial fixture:

- Vakaros CSV.GZ sample

Parser tests should validate at least:

- number of samples;
- start timestamp;
- end timestamp;
- latitude and longitude availability;
- SOG;
- COG;
- heading;
- heel;
- trim.

## Scope control

Do not introduce yet:

- complex authentication;
- Kubernetes;
- message brokers;
- microservices;
- advanced permissions;
- AI features;
- Garmin API dependencies;
- premature cloud architecture.

The current focus is validating the ingestion and activity-processing workflow.
