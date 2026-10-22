#!/usr/bin/env bash
# This file follows the Docker standard that NoneSilva adopts in docker-kit.
[ $# -eq 1 ] || { echo "usage: . docker.sh <path of the runner>" >&2; return 2; }
docker_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker_repository="$(git config --file "$docker_root/measurements.gitconfig" --get repository.source)"
docker_labels=(--label "org.opencontainers.image.source=$docker_repository"
  --label "maintenance.repository-id=$(git config --file "$docker_root/measurements.gitconfig" --get repository.id)")
docker_created_by="$(realpath --relative-to="$docker_root" "$1")"

container_name() { echo "${docker_repository##*/}-$1-run-$$"; }

run_temporary() {
  local role=$1; shift
  # A runner that passes the id of its caller gets 0 under sudo, and no container runs as root.
  case "${user:-65534:65534}" in
    0|0:*|root|root:*) echo "refused: the container $role would run as root; run as a user other than root" >&2; return 2 ;;
  esac
  docker run --rm --init --name "$(container_name "$role")" --network "${network_mode:-none}" \
    --user "${user:-65534:65534}" -e HOME=/tmp --read-only --tmpfs "${tmpfs:-/tmp}" --cap-drop ALL \
    --security-opt no-new-privileges --memory "${mem_limit:-256m}" --cpus "${cpus:-1}" \
    --pids-limit "${pids_limit:-64}" "${docker_labels[@]}" \
    --label maintenance.lifetime=temporary --label "maintenance.created-by=$docker_created_by" "$@"
}

image_tag() { echo "${docker_repository##*/}-$1:dev"; }

build_image() {
  local role=$1; shift
  docker build -q -t "$(image_tag "$role")" "${docker_labels[@]}" "$@"
}
