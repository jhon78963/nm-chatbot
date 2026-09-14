#!/usr/bin/env bash
#
# ec2-profile.sh — Resolve EC2 host/key from VPS profile (work | home).
#
# Usage (source from other scripts):
#   source "${SCRIPT_DIR}/ec2-profile.sh"
#   ec2_profile_resolve "${VPS_DIR}"           # optional profile override as 2nd arg
#   ec2_profile_ssh_opts
#
_ec2_profile_die() {
  echo "Error: $*" >&2
  exit 1
}

ec2_profile_resolve() {
  local vps_dir="$1"
  local profile_override="${2:-}"
  local local_env="${vps_dir}/local.env"
  local profile="${profile_override:-${VPS_PROFILE:-}}"

  if [[ -f "${local_env}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${local_env}"
    set +a
    profile="${profile_override:-${VPS_PROFILE:-${profile}}}"
  fi

  if [[ -z "${profile}" ]]; then
    local has_work=0 has_home=0
    [[ -f "${vps_dir}/repository_uprit.pem" ]] && has_work=1
    [[ -f "${vps_dir}/RepositoryMagazine.pem" ]] && has_home=1

    if (( has_work && ! has_home )); then
      profile=work
    elif (( has_home && ! has_work )); then
      profile=home
    elif (( has_work && has_home )); then
      _ec2_profile_die "Both PEM files found. Set VPS_PROFILE=work or home in vps/local.env (see vps/local.env.example)."
    else
      _ec2_profile_die "No PEM found in ${vps_dir}. Add repository_uprit.pem (work) or RepositoryMagazine.pem (home)."
    fi
  fi

  case "${profile}" in
    work)
      PEM_FILE="${vps_dir}/repository_uprit.pem"
      ;;
    home)
      PEM_FILE="${vps_dir}/RepositoryMagazine.pem"
      ;;
    *)
      _ec2_profile_die "Unknown VPS_PROFILE '${profile}'. Use work or home."
      ;;
  esac

  EC2_HOST="${EC2_HOST:-ec2-3-235-20-207.compute-1.amazonaws.com}"

  SSH_USER="${SSH_USER:-ubuntu}"
  REMOTE_DIR="${REMOTE_DIR:-/opt/chatbot-uprit}"

  if [[ ! -f "${PEM_FILE}" ]]; then
    _ec2_profile_die "PEM not found for profile '${profile}': ${PEM_FILE}"
  fi

  export VPS_PROFILE="${profile}"
  export PEM_FILE EC2_HOST SSH_USER REMOTE_DIR
}

ec2_profile_ssh_opts() {
  chmod 400 "${PEM_FILE}" 2>/dev/null || true
  SSH_OPTS=(
    -i "${PEM_FILE}"
    -o StrictHostKeyChecking=accept-new
    -o ConnectTimeout=20
  )
}
