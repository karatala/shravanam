# Public Assets

## Purpose

- Owns the PWA manifest, offline worker template, and runtime icons.

## Local Contracts

- Manifest paths stay relative. Do not set a Rachana hosting path or file association.
- The worker caches only listed shell assets. Its cache namespace includes the application name and registration scope.
- Activate updates after old clients close. Delete only older shell caches with the same prefix.
- The current PNG icons are temporary copies from Rachana. Replace them when the Shravanam design is supplied.
- Keep this instruction file out of published output.

## Work Guidance

## Verification

- `LOCAL_OFFLINE.md` owns the manual cache checks, which run only when requested.

## Child DOX Index
