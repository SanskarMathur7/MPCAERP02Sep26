# Security Overview

This document summarizes the specific security protections that are currently built into the application. It describes the technical safeguards in place around the app's data, its interfaces, and its hosting. Each item below reflects a measure that is actually implemented in the current system.

## Data Protection

All communication between a user's browser and the application is encrypted in transit using HTTPS. In plain terms, the information travelling between a user and the app is scrambled so it cannot be read or altered by anyone intercepting it along the way.

The application's database is not exposed to the public internet — it can only be reached from the application's own server, which removes an entire category of "direct database access" attacks that affect systems whose databases are left openly reachable.

The application relies on a third-party artificial-intelligence service to help review certain documents. The access key for that service is used only on the server side and is never sent to, or stored in, the user's browser, so it cannot be extracted by end users. More generally, configuration secrets are supplied to the app through the hosting environment rather than being written into the application's own source code.

## Application Security

Information submitted through the app is validated against defined data rules before it is accepted. Each type of record has an expected shape (which fields are required, what kind of value each should hold), and submissions that don't match are rejected — this stops malformed or unexpected data from entering the system.

The application communicates with its database using structured queries rather than by assembling commands out of raw text, and any free-text search terms a user types are neutralized before they are used. Together these practices close off "injection" attacks, where an attacker tries to smuggle their own commands into the system through an ordinary input field.

Anything a user types that is later shown back on screen is automatically escaped by the app's user-interface framework, meaning embedded HTML or scripts are displayed as harmless text rather than executed. This protects against "cross-site scripting" — attempts to run malicious code inside another user's browser session.

Uploaded files are controlled in three ways: only common document and image formats are accepted, each file is limited to a maximum size, and every stored file is given a randomly generated internal name rather than keeping its original filename. This prevents unexpected or oversized files from being stored and blocks attempts to reach other files on the server by manipulating file names or paths.

Finally, the version of the app delivered to users' browsers does not include its readable underlying source code, so the app's internal workings are not handed out to the public.

## Infrastructure & Hosting

The application is deployed on a managed cloud hosting platform and is served to users exclusively over HTTPS. Running on managed infrastructure means the underlying servers and network are maintained by the platform provider, and the encrypted-connection requirement applies to all user traffic.

---

Security is not a one-time exercise. The protections described above are part of the application as it stands today, and they are reviewed and maintained on an ongoing basis as the app evolves. We recommend periodic reviews so that safeguards continue to keep pace with new features and changing requirements.
