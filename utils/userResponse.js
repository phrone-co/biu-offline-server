function userResponse({
  user_id,
  user_name,
  user_email,
  user_regdate,
  user_firstname,
  user_regnumber,
  user_level,
  user_otpkey,
}) {
  return {
    user_id,
    user_name,
    user_email,
    user_regdate,
    user_firstname,
    user_regnumber,
    user_level,
    user_otpkey,
  };
}

module.exports = { userResponse };
