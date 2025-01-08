# Release Process

## Pr phase

Before committing finishing a PR run `npx changeset` to generate a new changeset. The changeset will either be a major minor or patch change.
This will generate a file in the .changeset folder that will have the change description of what you have worked on.

## Publishing phase

### Pre branch release

Before creating release branch in the format release/changed-elements-react-vx.x.x
Run `npx changeset version` on master to update the package.json and changelog then create the release branch.
This will create and tag a release for the repository

### Post branch release

(Todo)Maybe figure out better way of doing this.
A Pr will be created from release branch pointing at master. Merge PR in and do not delete branch.

Go to [ADO Pipeline](https://bentleycs.visualstudio.com/iModelTechnologies/_build?definitionId=9397) and run based on tagged release. This will publish the package.
